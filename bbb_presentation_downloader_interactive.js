#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const pLimitModule = require('p-limit');
const pLimit = pLimitModule.default;

// Configuration
const baseUrl = process.argv[2];
const outputDir = './presentation_slides';
const outputPdf = './bbb_presentation.pdf';

// Validate URL parameter
if (!baseUrl) {
  console.error('❌ Error: URL parameter is required');
  console.error('\nUsage: node bbb_presentation_downloader_interactive.js <url>');
  console.error('\nExample: node bbb_presentation_downloader_interactive.js "https://example.com/presentation/slides/svg/"');
  process.exit(1);
}

// Basic URL validation
if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
  console.error('❌ Error: URL must start with http:// or https://');
  process.exit(1);
}

// Ensure URL ends with trailing slash
const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

console.log('Using base URL:', normalizedUrl);

let slideNumber = 1;

console.log('Starting presentation download...');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create readline interface for CLI prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask user a question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase().trim());
    });
  });
}

// Function to fetch a slide
async function fetchSlide(num) {
  return new Promise((resolve) => {
    https.get(`${normalizedUrl}${num}`, (response) => {
      if (response.statusCode === 404) {
        resolve(null);
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve(data);
        } else {
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error(`Error fetching slide ${num}:`, error.message);
      resolve(null);
    });
  });
}

// Phase 1: Download all SVG files
async function downloadAllSVGs() {
  console.log('\n📥 PHASE 1: Downloading all SVG files...\n');
  const svgFiles = [];
  let slideNum = 1;
  let hasError = false;

  while (!hasError) {
    console.log(`Fetching slide ${slideNum}...`);
    const svgContent = await fetchSlide(slideNum);

    if (!svgContent) {
      console.log(`Reached end at slide ${slideNum}. Total slides downloaded: ${slideNum - 1}\n`);
      hasError = true;
      break;
    }

    // Save SVG file
    const svgPath = path.join(outputDir, `slide_${String(slideNum).padStart(3, '0')}.svg`);
    fs.writeFileSync(svgPath, svgContent);
    svgFiles.push({ slideNum, path: svgPath });
    console.log(`Slide ${slideNum} saved to ${svgPath}`);

    slideNum++;
  }

  return svgFiles;
}

// Phase 2: Convert SVG files to PNG (parallel processing)
async function convertSVGsToPNG(svgFiles) {
  console.log('\n🎨 PHASE 2: Converting SVG files to PNG (parallel processing)...\n');
  const pngFiles = [];

  // Determine number of concurrent workers (use CPU count - 1, minimum 2)
  const numCPUs = require('os').cpus().length;
  const concurrentWorkers = Math.max(2, numCPUs - 1);
  const limit = pLimit(concurrentWorkers);

  console.log(`⚡ Using ${concurrentWorkers} parallel workers\n`);

  let completed = 0;

  const conversionTasks = svgFiles.map((svgFile) =>
    limit(async () => {
      const { slideNum, path: svgPath } = svgFile;

      try {
        const svgBuffer = fs.readFileSync(svgPath);
        const pngPath = svgPath.replace('.svg', '.png');

        const pngBuffer = await sharp(svgBuffer, {
          density: 300
        })
          .png({
            quality: 100,
            compressionLevel: 9
          })
          .toFile(pngPath);

        pngFiles.push({ slideNum, path: pngPath });
        completed++;
        console.log(`Slide ${slideNum} converted to PNG (${completed}/${svgFiles.length}) - ${(pngBuffer.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (error) {
        completed++;
        console.error(`Failed to convert slide ${slideNum} (${completed}/${svgFiles.length}):`, error.message);
      }
    })
  );

  await Promise.all(conversionTasks);

  // Sort PNG files by slide number to maintain correct order
  pngFiles.sort((a, b) => a.slideNum - b.slideNum);

  console.log(`\n Conversion complete: ${pngFiles.length}/${svgFiles.length} slides converted\n`);
  return pngFiles;
}

// Phase 3: Create PDF from PNG files
async function createPDFFromPNGs(pngFiles) {
  console.log('\n📦 PHASE 3: Creating PDF...\n');

  if (pngFiles.length === 0) {
    console.error('No PNG files to create PDF from');
    return;
  }

  try {
    const doc = new PDFDocument({
      size: [1920, 1080],
      margin: 0,
      compression: false
    });

    const stream = fs.createWriteStream(outputPdf);
    doc.pipe(stream);

    for (let index = 0; index < pngFiles.length; index++) {
      const { slideNum, path: pngPath } = pngFiles[index];

      if (index > 0) {
        doc.addPage({ size: [1920, 1080], margin: 0 });
      }

      try {
        doc.image(pngPath, 0, 0, { width: 1920, height: 1080 });
        console.log(`Added slide ${slideNum} to PDF (${index + 1}/${pngFiles.length})`);
      } catch (error) {
        console.error(`Error adding slide ${slideNum} to PDF:`, error.message);
      }
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        const fileSize = fs.statSync(outputPdf).size;
        console.log(`\n PDF created successfully: ${outputPdf}`);
        console.log(` PDF size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });

      stream.on('error', (error) => {
        console.error(` Error writing PDF: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    console.error(` PDF creation failed: ${error.message}`);
  }
}

// Delete PNG files (keep only SVG)
function deletePNGFiles(svgFiles) {
  console.log('\n Cleaning up PNG files...\n');
  for (const { slideNum, path: svgPath } of svgFiles) {
    const pngPath = svgPath.replace('.svg', '.png');
    if (fs.existsSync(pngPath)) {
      fs.unlinkSync(pngPath);
      console.log(` Deleted ${pngPath}`);
    }
  }
}

// Delete SVG files (keep only PNG)
function deleteSVGFiles(svgFiles) {
  console.log('\n Cleaning up SVG files...\n');
  for (const { slideNum, path: svgPath } of svgFiles) {
    if (fs.existsSync(svgPath)) {
      fs.unlinkSync(svgPath);
      console.log(` Deleted ${svgPath}`);
    }
  }
}

// Main execution
async function main() {
  try {
    // Phase 1: Download all SVGs FIRST (always secure all SVGs before anything else)
    console.log('  IMPORTANT: Downloading and securing all SVG files first...');
    const svgFiles = await downloadAllSVGs();

    if (svgFiles.length === 0) {
      console.error('❌ No slides were downloaded');
      rl.close();
      process.exit(1);
    }

    console.log('\n All SVG files are now safely saved in:', outputDir);
    console.log(' You can now safely close the presentation\n');

    // Ask user what they want to do
    console.log(' What would you like to do?\n');
    console.log('1. Keep SVG files only (smallest size)');
    console.log('2. Convert to PNG files only (medium size, better quality)');
    console.log('3. Convert to PNG and keep both SVG and PNG files (largest size)');
    console.log('4. Create PDF from PNG + delete image files (smallest PDF)');
    console.log('5. Create PDF + keep PNG files');
    console.log('6. Create PDF + keep both SVG and PNG files\n');

    const choice = await askQuestion('Enter your choice (1-6): ');

    switch (choice) {
      case '1':
        console.log('\n Keeping SVG files only...');
        console.log('\n Done! SVG files saved in:', outputDir);
        break;

      case '2':
        console.log('\n Converting SVG to PNG...');
        const pngFiles2 = await convertSVGsToPNG(svgFiles);
        deleteSVGFiles(svgFiles);
        console.log('\n Done! PNG files saved in:', outputDir);
        break;

      case '3':
        console.log('\n Converting SVG to PNG...');
        await convertSVGsToPNG(svgFiles);
        console.log('\n Done! Both SVG and PNG files saved in:', outputDir);
        break;

      case '4':
        console.log('\n Converting SVG to PNG...');
        const pngFiles4 = await convertSVGsToPNG(svgFiles);
        console.log('\n Creating PDF...');
        await createPDFFromPNGs(pngFiles4);
        deleteSVGFiles(svgFiles);
        deletePNGFiles(svgFiles);
        console.log('\n Done! PDF created:', outputPdf);
        console.log(' Image files deleted to save space');
        break;

      case '5':
        console.log('\n Converting SVG to PNG...');
        const pngFiles5 = await convertSVGsToPNG(svgFiles);
        console.log('\n Creating PDF...');
        await createPDFFromPNGs(pngFiles5);
        deleteSVGFiles(svgFiles);
        console.log('\n Done! PDF created:', outputPdf);
        console.log(' PNG files saved in:', outputDir);
        break;

      case '6':
        console.log('\n Converting SVG to PNG...');
        const pngFiles6 = await convertSVGsToPNG(svgFiles);
        console.log('\n Creating PDF...');
        await createPDFFromPNGs(pngFiles6);
        console.log('\n Done! PDF created:', outputPdf);
        console.log(' Both SVG and PNG files saved in:', outputDir);
        break;

      default:
        console.log(' Invalid choice. Please try again.');
        rl.close();
        process.exit(1);
    }

    rl.close();
  } catch (error) {
    console.error('Fatal error:', error);
    rl.close();
    process.exit(1);
  }
}

main();
