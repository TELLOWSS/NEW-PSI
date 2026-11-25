// Synthetic browser-only UI harness for the legacy PDF split workflow.
// No real worker record, OCR request, storage write, or application bootstrap.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FileUpload } from '../../components/FileUpload';

function Harness() {
    const [files, setFiles] = useState<File[]>([]);
    const [analysisClicks, setAnalysisClicks] = useState(0);
    return React.createElement(
        React.Fragment,
        null,
        React.createElement(FileUpload, {
            files,
            fileCount: files.length,
            onFilesChange: setFiles,
            onAnalyze: () => setAnalysisClicks(count => count + 1),
            isAnalyzing: false,
        }),
        React.createElement('output', {
            id: 'ocr-harness-state',
            'data-file-count': String(files.length),
            'data-analysis-clicks': String(analysisClicks),
        }, JSON.stringify(files.map(file => ({ name: file.name, size: file.size, lastModified: file.lastModified })))),
    );
}

const target = document.getElementById('ocr-harness-root');
if (!target) throw new Error('Synthetic OCR UI harness container missing');
createRoot(target).render(React.createElement(Harness));
