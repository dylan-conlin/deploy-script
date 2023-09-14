import { getGitBranch } from './helpers.mjs';

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
