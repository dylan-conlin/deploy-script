#!/usr/bin/env zx

// After changing this script, deploy to S3 and update your env with the latest url:
// export DEPLOY_SCRIPT_URL_3=""
// Some S2 templates use the DEPLOY_SCRIPT_URL_3 in their deploy scripts. Soon, they all will use it.
const config = require('./deploy.config.js');
const S3_BUCKET = 'template-assets.shortstack.com';
const CLOUDFRONT_DISTRIBUTION_ID = 'E3I8BZ6ZUCKW10';
const CLOUDFRONT_URL = 'https://d1m2uzvk8r2fcn.cloudfront.net';

const templateName = config.name;
const serverName = config.server || templateName;
const newVersionName = process.argv[3];
const versionName = newVersionName || config.appVersion || '';

// Utility function to upload a file to S3
async function uploadToS3(source, destination, contentType) {
  await $`aws s3 cp ${source} s3://${S3_BUCKET}${destination} --acl public-read --content-type ${contentType} --profile shortstack`;
}

// Utility function deploy a script
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

// Define functions for each deployment task
async function buildAndDeployScript() {
  return deploy('script', [
    {
      source: `dist/${templateName}.es.js`,
      destination: `/scripts/${templateName}/${versionName}.js`,
      contentType: 'application/javascript',
    },
  ]);
}

async function buildAndDeployApp() {
  const files = [
    {
      source: 'dist/app.js',
      destination: `/scripts/${templateName}/${versionName}.js`,
      contentType: 'application/javascript',
    },
  ];
  if (config.css) {
    files.push({
      source: 'dist/app.css',
      destination: `/scripts/${templateName}/${versionName}.css`,
      contentType: 'text/css',
    });
  }
  await $`yarn run build`
  return deploy('app', files);
}

async function buildAndDeployWizard() {
  await $`yarn run build:wizard`
  return deploy('wizard', [
    {
      source: 'dist/app.js',
      destination: `/scripts/${templateName}-wizard/${versionName}.js`,
      contentType: 'application/javascript',
    },
    {
      source: 'dist/app.css',
      destination: `/scripts/${templateName}-wizard/${versionName}.css`,
      contentType: 'text/css',
    },
  ]);
}

async function buildAndDeployMisc() {
  await $`yarn run build:misc`
  return deploy('misc', [
    {
      source: 'dist/app.js',
      destination: `/scripts/${templateName}-misc/${versionName}.js`,
      contentType: 'application/javascript',
    },
  ]);
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

(async function () {
  try {
    console.log(config);

    let filesToInvalidate = [];

    if ('miscVersion' in config) {
      const miscFiles = await buildAndDeployMisc();
      filesToInvalidate.push(...miscFiles);
    }

    const scriptFiles = (config.scriptVersion === 'vite') ? await buildAndDeployScript() : await buildAndDeployApp();
    filesToInvalidate.push(...scriptFiles);

    if ('wizardVersion' in config) {
      const wizardFiles = await buildAndDeployWizard();
      filesToInvalidate.push(...wizardFiles);
    }

    // the script is run with a new version name
    if (!newVersionName) {
      await invalidateCloudFrontCache(filesToInvalidate);
    }

    await updateDeployConfig();
    await generateScriptBlob();
  } catch (error) {
    console.error('An error occurred during deployment:', error);
  }
})();
