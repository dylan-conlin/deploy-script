import { runCommand } from './helpers.mjs';
import { deploy } from './deploy.mjs';
import { createBackup } from './backup.mjs';

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
