import { uploadToS3 } from './helpers.mjs';

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
