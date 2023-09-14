#!/usr/bin/env zx

import path from 'path';
// Now import the config relative to the new working directory
import config from '/Users/dylanconlin/Documents/shortstack_apps/shortstack-templates-s2/templates/fortune-wheel/deploy.config.mjs';
import { exec } from 'child_process';

// Change the working directory to two levels up
const projectRoot = path.join(__dirname, '..', '..');
process.chdir(projectRoot);

const S3_BUCKET = 'template-assets.shortstack.com';
const CLOUDFRONT_DISTRIBUTION_ID = 'E3I8BZ6ZUCKW10';
const CLOUDFRONT_URL = 'https://d1m2uzvk8r2fcn.cloudfront.net';

const templateName = config.name;
const serverName = config.server || templateName;
const newVersionName = process.argv[3];
const versionName = newVersionName || config.appVersion || '';

// Helper function to run async shell commands
async function runCommand(command) {
  try {
    await $`command`;
  } catch (error) {
    console.error(`Error executing command: ${command}`, error);
  }
}

// Utility function to upload a file to S3
async function uploadToS3(source, destination, contentType) {
  await $`aws s3 cp ${source} s3://${S3_BUCKET}${destination} --acl public-read --content-type ${contentType} --profile shortstack`;
}

// Helper function to get the current git branch name
async function getGitBranch() {
  return new Promise((resolve, reject) => {
    exec('git rev-parse --abbrev-ref HEAD', (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      // Replacing all occurrences of "/" with "_"
      const sanitizedBranchName = stdout.trim().replace(/\//g, '_');
      resolve(sanitizedBranchName);
    });
  });
}

// Upload to S3 and invalidate CloudFront
async function deploy(type, sourceFiles) {
  try {
    const filesToInvalidate = [];
    for (const file of sourceFiles) {
      const { source, destination, contentType } = file;
      await uploadToS3(source, destination, contentType);
      filesToInvalidate.push(destination);
    }
    return filesToInvalidate;
  } catch (error) {
    console.error(`Error building and deploying ${type}:`, error);
    return [];
  }
}

async function createBackup(files) {
  files.forEach(async (file) => {
    const { source, backupName, contentType } = file;

    const gitBranch = await getGitBranch();

    // Create the directory path with the git branch as the first-level folder
    const dirPath = path.join('snapshots', gitBranch);

    // Ensure the directory exists
    fs.promises.mkdir(dirPath, { recursive: true })
      .then(() => {
        // Create the backup
        const backupPath = path.join(dirPath, file.backupName);
        fs.promises.copyFile(source, backupPath)
          .catch((err) => {
            console.error(`Failed to create a backup: ${err}`);
          });
      })
      .catch((err) => {
        console.error(`Failed to create backup directory: ${err}`);
      });
  });
}

async function runC(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

// second part:
//
async function buildAndDeploy(type, buildCommand, fileMappings) {
  echo(`Building ${type}...`);
  await runC(buildCommand);

  const gitBranch = await getGitBranch();

  // Generate a simpler, more readable timestamp in YYYYMMDD-HHMMSS format
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '') + '-' +
    now.toTimeString().slice(0, 8).replace(/:/g, '');

  const files = fileMappings.map(({source, suffix, contentType}) => {
    // Handle empty string for suffix
    const adjustedSuffix = suffix ? `-${suffix}` : '';

    // Correct the file extension
    const fileExtension = contentType === 'application/javascript' ? 'js' : contentType.split('/')[1];

    return {
      source,
      backupName: `${timestamp}-${templateName}${adjustedSuffix}-${versionName}.${fileExtension}`,
      destination: `/scripts/${templateName}${adjustedSuffix}/${versionName}.${fileExtension}`,
      contentType,
    };
  });

  await createBackup(files);
  return deploy(type, files);
}

async function buildAndDeployScript() {
  return buildAndDeploy('script', 'yarn run build', [{source: `dist/${templateName}.es.js`, suffix: 'js', contentType: 'application/javascript'}]);
}

async function buildAndDeployApp() {
  const fileMappings = [{source: 'dist/app.js', suffix: '', contentType: 'application/javascript'}];

  if (config.css) {
    fileMappings.push({source: 'dist/app.css', suffix: '', contentType: 'text/css'});
  }

  return buildAndDeploy('app', 'yarn run build', fileMappings);
}

async function buildAndDeployWizard() {
  const fileMappings = [
    {source: 'dist/app.js', suffix: 'wizard', contentType: 'application/javascript'},
    {source: 'dist/app.css', suffix: 'wizard', contentType: 'text/css'}
  ];

  return buildAndDeploy('wizard', 'yarn run build:wizard', fileMappings);
}

async function buildAndDeployMisc() {
  return buildAndDeploy('misc', 'yarn run build:misc', [{source: 'dist/app.js', suffix: 'misc', contentType: 'application/javascript'}]);
}

async function invalidateCloudFrontCache(filesToInvalidate) {
  try {
    if (filesToInvalidate.length > 0) {
      await $`aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --paths ${filesToInvalidate} --profile shortstack`;
    }
  } catch (error) {
    console.error('Error invalidating CloudFront cache:', error);
  }
}

async function updateDeployConfig() {
  try {
    await fs.writeFile("deploy.config.js", `module.exports = ${JSON.stringify(config, null, 2)}`);
  } catch
    (error) {
      console.error('Error updating deploy config:', error);
    }
}

// fourth part:
async function generateScriptBlob() {
  try {
    let miscScript = '';
    if ('miscVersion' in config) {
      miscScript = `<script src="${CLOUDFRONT_URL}/scripts/${templateName}-misc/${versionName}.js" type='text/javascript'></script>`
    }
    const wizardVersion = 'wizardVersion' in config ? versionName : '';
    const blob = `
        ${miscScript}
        ${config.beforeScripts || ''}
        <script type='text/javascript'>
          function loadScript(url, env) {return new Promise(function(resolve, reject) {var script = document.createElement('script'); document.body.appendChild(script); if (env === 'development') script.type = 'module'; script.onload = resolve; script.onerror = reject; script.async = false; script.src = url;});}
          campaign.on('campaign-loaded', function() {
            campaign.disableAutoLock()
            var getQueryParams = function() {
              return new Promise(function(resolve, reject) {
                if (campaign.app().mode !== 'live') {
                  window.SSTEMPLATE.getBuilderQueryParams().then((queryParams) => {
                    resolve(queryParams)
                  })
                } else {
                  resolve(campaign.queryParamsGet())
                }
              })
            }
            getQueryParams().then(queryParams => {
              var isDev = queryParams.dev && queryParams.dev === '1'
              var scriptLoaderDev = queryParams.scriptLoaderDev && queryParams.scriptLoaderDev === '1'
              var url = scriptLoaderDev ? 'https://ss-script-loader.shortstack.local/main.js' : 'https://d1m2uzvk8r2fcn.cloudfront.net/scripts/ss-script-loader/${config.scriptLoaderVersion}.js'
              var env = isDev ? 'development' : 'production'
              loadScript(url, env).then(function() {
                try {
                  window.ssTL({
                    name: '${templateName}',
                    campaign: window.campaign,
                    css: ${config.css},
                    env: env,
                    assetsLoadedCallback: function() {
                      ${config.afterCampaignLoaded || ''}
                    },
                    appVersion: '${versionName}',
                    wizardVersion: '${'wizardVersion' in config ? versionName : ''}',
                    scriptVersion: '${config.scriptVersion}',
                    server: '${serverName}',
                  })
                  window.SSTManager.loadAssets()
                } catch(e) {
                  console.log('ss-script-loader Error:', e)
                }
              })
            })
          }, { widget: '%WIDGET%', synchronous: true })
        </script>
        `;
    await fs.writeFile("template-code.html", blob);
    await $`echo ${blob} | pbcopy`;
  } catch (error) {
    console.error('Error generating script blob:', error);
  }
}

// Tasks based on conditions
const tasks = [
  { condition: 'miscVersion', task: buildAndDeployMisc, buildCommand: 'yarn run build:misc' },
  { condition: 'wizardVersion', task: buildAndDeployWizard, buildCommand: 'yarn run build:wizard' },
];

// Entry point for the build script
(async function () {
  try {
    console.log(config);

    let filesToInvalidate = [];

    for (const { condition, task, buildCommand } of tasks) {
      if (condition in config) {
        await runCommand(buildCommand);
        const newFiles = await task();
        filesToInvalidate.push(...newFiles);
      }
    }

    const scriptFiles = (config.scriptVersion === 'vite') ? await buildAndDeployScript() : await buildAndDeployApp();
    filesToInvalidate.push(...scriptFiles);

    if (!newVersionName) {
      await invalidateCloudFrontCache(filesToInvalidate);
    }

    await updateDeployConfig();
    await generateScriptBlob();

  } catch (error) {
    console.error('An error occurred during deployment:', error);
  }
})();
