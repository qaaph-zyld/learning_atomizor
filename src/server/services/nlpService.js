const { spawn } = require('child_process');
const path = require('path');

class NLPService {
  static async processContent(content) {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, 'nlp.py');
      const pythonProcess = spawn('python', [pythonScript]);
      
      let outputData = '';
      let errorData = '';

      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`NLP process exited with code ${code}: ${errorData}`));
          return;
        }
        
        try {
          const result = JSON.parse(outputData);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse NLP output: ${error.message}`));
        }
      });

      // Send content to Python script
      pythonProcess.stdin.write(content);
      pythonProcess.stdin.end();
    });
  }
}

module.exports = NLPService;
