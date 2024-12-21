const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const json2csv = require('json2csv').parse;
const PDFDocument = require('pdfkit');
const Content = require('../models/Content');

class ExportService {
  constructor() {
    this.supportedFormats = ['json', 'csv', 'pdf', 'zip'];
  }

  async exportContent(contentIds, format, options = {}) {
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }

    const contents = await Content.find({
      _id: { $in: contentIds }
    }).populate('createdBy', 'name email');

    if (contents.length === 0) {
      throw new Error('No content found to export');
    }

    const exportDir = path.join(__dirname, '../exports');
    await fs.mkdir(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportId = `export-${timestamp}`;
    const exportPath = path.join(exportDir, exportId);

    switch (format) {
      case 'json':
        return await this.exportToJson(contents, exportPath, options);
      case 'csv':
        return await this.exportToCsv(contents, exportPath, options);
      case 'pdf':
        return await this.exportToPdf(contents, exportPath, options);
      case 'zip':
        return await this.exportToZip(contents, exportPath, options);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  async exportToJson(contents, basePath, options) {
    const exportPath = `${basePath}.json`;
    const exportData = contents.map(content => this.formatContentForExport(content, options));
    
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    
    return {
      path: exportPath,
      filename: path.basename(exportPath),
      mimeType: 'application/json'
    };
  }

  async exportToCsv(contents, basePath, options) {
    const exportPath = `${basePath}.csv`;
    const exportData = contents.map(content => this.formatContentForExport(content, options));
    
    const csv = json2csv(exportData, {
      fields: [
        'title',
        'summary',
        'keywords',
        'duration',
        'status',
        'createdBy',
        'createdAt',
        'accuracyScore'
      ]
    });
    
    await fs.writeFile(exportPath, csv);
    
    return {
      path: exportPath,
      filename: path.basename(exportPath),
      mimeType: 'text/csv'
    };
  }

  async exportToPdf(contents, basePath, options) {
    const exportPath = `${basePath}.pdf`;
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(exportPath);

    return new Promise((resolve, reject) => {
      doc.pipe(stream);

      // Title
      doc.fontSize(20).text('Learning Content Export', { align: 'center' });
      doc.moveDown();

      contents.forEach((content, index) => {
        if (index > 0) doc.addPage();

        const formattedContent = this.formatContentForExport(content, options);

        // Content Title
        doc.fontSize(16)
          .fillColor('#2196F3')
          .text(formattedContent.title);
        doc.moveDown();

        // Summary
        doc.fontSize(12)
          .fillColor('#000000')
          .text('Summary:', { underline: true });
        doc.fontSize(10)
          .text(formattedContent.summary);
        doc.moveDown();

        // Keywords
        doc.fontSize(12)
          .text('Keywords:', { underline: true });
        doc.fontSize(10)
          .text(formattedContent.keywords.join(', '));
        doc.moveDown();

        // Metrics
        doc.fontSize(12)
          .text('Metrics:', { underline: true });
        doc.fontSize(10)
          .text(`Duration: ${formattedContent.duration} seconds`);
        doc.text(`Accuracy Score: ${(formattedContent.accuracyScore * 100).toFixed(1)}%`);
        doc.text(`Status: ${formattedContent.status}`);
        doc.text(`Created By: ${formattedContent.createdBy}`);
        doc.text(`Created At: ${formattedContent.createdAt}`);
      });

      doc.end();

      stream.on('finish', () => {
        resolve({
          path: exportPath,
          filename: path.basename(exportPath),
          mimeType: 'application/pdf'
        });
      });

      stream.on('error', reject);
    });
  }

  async exportToZip(contents, basePath, options) {
    const exportPath = `${basePath}.zip`;
    const output = fs.createWriteStream(exportPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve({
          path: exportPath,
          filename: path.basename(exportPath),
          mimeType: 'application/zip'
        });
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add JSON export
      const jsonContent = contents.map(content => 
        this.formatContentForExport(content, options)
      );
      archive.append(JSON.stringify(jsonContent, null, 2), { name: 'content.json' });

      // Add CSV export
      const csv = json2csv(jsonContent, {
        fields: [
          'title',
          'summary',
          'keywords',
          'duration',
          'status',
          'createdBy',
          'createdAt',
          'accuracyScore'
        ]
      });
      archive.append(csv, { name: 'content.csv' });

      // Add individual content files
      contents.forEach(content => {
        const formatted = this.formatContentForExport(content, options);
        archive.append(JSON.stringify(formatted, null, 2), {
          name: `content/${content._id}.json`
        });
      });

      archive.finalize();
    });
  }

  formatContentForExport(content, options = {}) {
    const formatted = {
      title: content.title,
      summary: content.summary,
      keywords: content.keywords,
      duration: content.duration,
      status: content.status,
      createdBy: content.createdBy?.name || 'Unknown',
      createdAt: content.createdAt,
      accuracyScore: content.processingMetrics?.accuracyScore || 0
    };

    if (options.includeOriginalContent) {
      formatted.originalContent = content.originalContent;
    }

    if (options.includeAtomizedContent) {
      formatted.atomizedContent = content.atomizedContent;
    }

    if (options.includeMetrics) {
      formatted.metrics = content.processingMetrics;
    }

    return formatted;
  }

  async cleanupExports(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const exportDir = path.join(__dirname, '../exports');
    
    try {
      const files = await fs.readdir(exportDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(exportDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up exports:', error);
    }
  }
}

module.exports = new ExportService();
