import { exec } from 'child_process';

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
