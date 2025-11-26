# BBB Presentation Downloader

Download BigBlueButton presentations and convert them to PDF.

## Features

- Download all SVG slides from a BigBlueButton presentation
- Convert SVG to PNG with high quality (300 DPI)
- Create PDF from PNG files
- Parallel processing for faster conversion
- Interactive menu with multiple output options

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Yzaza/bbb-presentation-downloader.git
cd bbb-presentation-downloader
```

2. Install dependencies:
```bash
npm install
```

## Getting the URL

To use this downloader, you need to extract the presentation URL from BigBlueButton:

1. Open the BigBlueButton presentation in your browser
2. Open **Developer Tools** (F12 or right-click → Inspect)
3. Go to the **Network** tab
4. Look for requests to SVG files (filter by "svg" if needed)
5. Click on one of the SVG image requests
6. Copy the URL from the request
7. **Remove the slide number** from the end and keep only the base URL

Example:
- Full URL: `https://example.com/presentation/slides/svg/1`
- Base URL to use: `https://example.com/presentation/slides/svg/`

## Usage

```bash
node bbb_presentation_downloader_interactive.js "https://your-base-url-here/svg/"
```

Example:
```bash
node bbb_presentation_downloader_interactive.js "https://visioconference.example.com/bigbluebutton/presentation/abc123/xyz789/presentation-slides/svg/"
```

The script will:
1. Download all SVG slides
2. Ask you what format you want (SVG only, PNG only, PDF, etc.)
3. Process and save the files accordingly

## Output Options

1. **Keep SVG files only** - Smallest file size
2. **Convert to PNG only** - Medium size, better quality
3. **Keep both SVG and PNG** - Largest file size
4. **Create PDF + delete images** - Smallest PDF
5. **Create PDF + keep PNG** - PDF with PNG backup
6. **Create PDF + keep both SVG and PNG** - All formats

## Requirements

- Node.js >= 14.0.0
- npm

## Dependencies

- `pdfkit` - PDF generation
- `sharp` - Image processing and conversion
- `p-limit` - Parallel processing control

## License

MIT
