import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dest=resolve('public/inspector-ocr/v1');
await mkdir(dest,{recursive:true});
await copyFile(resolve('node_modules/tesseract.js/dist/worker.min.js'),resolve(dest,'worker.min.js'));
for(const filename of ['tesseract-core.wasm.js','tesseract-core-simd.wasm.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js']) {
    await copyFile(resolve('node_modules/tesseract.js-core',filename),resolve(dest,filename));
}
for(const lang of ['eng','kor','vie','chi_sim']) {
    await copyFile(resolve(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`),resolve(dest,`${lang}.traineddata.gz`));
}
for(const [source,target] of [['tesseract.js/LICENSE.md','TESSERACT_JS_LICENSE.txt'],['tesseract.js-core/LICENSE','TESSERACT_CORE_LICENSE.txt']]) {
    await copyFile(resolve('node_modules',source),resolve(dest,target));
}
await copyFile(resolve('docs/safety-inspector/THIRD_PARTY_NOTICES.md'),resolve(dest,'THIRD_PARTY_NOTICES.md'));
console.log('Inspector OCR assets prepared from locked npm packages.');
