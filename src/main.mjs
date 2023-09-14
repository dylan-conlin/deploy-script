import * as constants from './constants.mjs';
import { runCommand, getGitBranch } from './helpers.mjs';
import { deploy } from './deploy.mjs';
import { createBackup } from './backup.mjs';
import { buildAndDeploy } from './buildAndDeploy.mjs';
import { generateDeploymentScript } from './deploymentScript.mjs';

// Entry point for the build script
(async function main() {
  try {
    // Extract configurations from the imported config file
    const { name: templateName, server: serverName = templateName, appVersion = '' } = config;
    const newVersionName = process.argv[3];
    const versionName = newVersionName || appVersion;

    // Initialize an array to keep track of files to invalidate
    let filesToInvalidate = [];

    // Loop through tasks and execute them
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
    await generateDeploymentScript(config);

  } catch (error) {
    console.error('An error occurred during deployment:', error);
  }
})();
