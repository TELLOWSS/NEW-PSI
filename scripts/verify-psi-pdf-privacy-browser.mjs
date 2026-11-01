import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const outDir='artifacts/audit/psi-pdf';
await mkdir(outDir,{recursive:true});
const server=await createServer({
    server:{host:'127.0.0.1',port:4198,strictPort:true},
});
let browser;
const results=[];
try{
    await server.listen();
    browser=await chromium.launch({headless:true});
    for(const configuration of [
        {name:'desktop',width:1280,height:800,isMobile:false},
        {name:'android-size-chromium',width:390,height:844,isMobile:true},
    ]){
        const context=await browser.newContext({
            viewport:{width:configuration.width,height:configuration.height},
            isMobile:configuration.isMobile,
            hasTouch:configuration.isMobile,
        });
        const page=await context.newPage();
        try{
            // Test an actual JSZip-compressed archive from the pinned npm lockfile.
            // No real records or network CDN are required.
            await page.addInitScript({content:"window.__psiTestOnly=true;"});
            await page.goto('http://127.0.0.1:4198/',{waitUntil:'domcontentloaded'});
            await page.addScriptTag({path:resolve('node_modules/jszip/dist/jszip.min.js')});
            const result=await page.evaluate(async()=>{
                const {
                    readPsiLocalPdf,verifyPsiRasterPdfHasNoExtractableContent,
                    loadPsiPdfRenderer,choosePsiPdfRenderScale,
                    downloadPreparedPsiRasterPdfReview,
                }=await import('/utils/psiPdfRasterReview.ts');
                const {psiMaskFromDrag,applyOpaquePsiPhotoMasks}=await import('/utils/psiPhotoMaskGeometry.ts');
                const {verifyPsiSavedReviewZipLocally}=await import('/utils/psiPdfLocalArchiveVerifier.ts');

                // A genuine PDF with xref/trailer, but synthetic-only text and no personal data.
                const makePdf=(count,mode='text')=>{
                    const objects={};
                    const kids=[];
                    objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
                    objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
                    for(let i=0;i<count;i++){
                        const p=4+i*2,c=p+1;
                        kids.push(p+' 0 R');
                        objects[p]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents '+c+' 0 R >>';
                        const stream=mode==='black'
                            ?'0 0 0 rg\n120 400 180 240 re f\n'
                            :mode==='empty'?''
                            :'BT /F1 16 Tf 48 730 Td (PSI SYNTHETIC PAGE '+String(i+1)+') Tj ET\n';
                        const bytes=new TextEncoder().encode(stream);
                        objects[c]='<< /Length '+bytes.length+' >>\nstream\n'+stream+'endstream';
                    }
                    objects[2]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+count+' >>';
                    const max=3+2*count;
                    let text='%PDF-1.4\n';
                    const offsets=[0];
                    for(let i=1;i<=max;i++){
                        offsets[i]=new TextEncoder().encode(text).length;
                        text+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
                    }
                    const at=new TextEncoder().encode(text).length;
                    text+='xref\n0 '+(max+1)+'\n0000000000 65535 f \n';
                    for(let i=1;i<=max;i++){
                        text+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
                    }
                    text+='trailer\n<< /Size '+(max+1)+' /Root 1 0 R >>\nstartxref\n'+at+'\n%%EOF\n';
                    return new TextEncoder().encode(text);
                };
                const cases=[];
                const pass=(name)=>cases.push({name,status:'PASS'});
                const ten=new File([makePdf(10)],'psi_synthetic_ten.pdf',{type:'application/pdf'});
                const read=await readPsiLocalPdf(ten);
                if(read.pageCount!==10||read.hash.length!==64)
                    throw new Error('Ten-page real PDF parse failed');
                pass('real-ten-page-input');

                let rejected=false;
                try{await readPsiLocalPdf(new File([makePdf(11)],'eleven.pdf',{type:'application/pdf'}));}
                catch{rejected=true;}
                if(!rejected)throw new Error('Eleven-page PDF accepted unexpectedly');
                pass('eleven-page-rejected');

                const pdfjs=await loadPsiPdfRenderer();
                const job=pdfjs.getDocument({data:new Uint8Array(await ten.arrayBuffer())});
                try{
                    const document=await job.promise;
                    const p=await document.getPage(1);
                    const text=await p.getTextContent();
                    if(!text.items.some(item=>String(item.str||'').includes('SYNTHETIC PAGE')))
                        throw new Error('Actual PDF text content missing');
                    const base=p.getViewport({scale:1});
                    const viewport=p.getViewport({scale:choosePsiPdfRenderScale(base.width,base.height)});
                    const canvas=globalThis.document.createElement('canvas');
                    canvas.width=Math.ceil(viewport.width);
                    canvas.height=Math.ceil(viewport.height);
                    const ctx=canvas.getContext('2d',{willReadFrequently:true});
                    await p.render({canvas,canvasContext:ctx,viewport}).promise;
                    applyOpaquePsiPhotoMasks(ctx,[{x:.2,y:.2,width:.3,height:.3}],canvas.width,canvas.height);
                    const px=ctx.getImageData(Math.floor(.35*canvas.width),Math.floor(.35*canvas.height),1,1).data;
                    if(px[0]!==0||px[1]!==0||px[2]!==0||px[3]!==255)
                        throw new Error('Opaque canvas mask failed');
                    pass('real-pdf-render-and-opaque-mask');
                    p.cleanup();
                }finally{await job.destroy();}

                const rect=psiMaskFromDrag(
                    {clientX:35,clientY:25},{clientX:195,clientY:305},
                    {left:15,top:5,width:320,height:400},
                );
                if(!rect||Math.abs(rect.x-0.0625)>1e-6||Math.abs(rect.width-0.5)>1e-6)
                    throw new Error('Viewport pointer normalization failed');
                pass('touch-pointer-normalization');

                const plan=[{pageNumber:1,manuallyReviewed:true,
                    masks:[{x:.2,y:.2,width:.3,height:.3}]}];
                await verifyPsiRasterPdfHasNoExtractableContent(makePdf(1,'black'),1,plan);
                pass('actual-black-raster-pdf-postflight');
                let whiteBlocked=false;
                try{await verifyPsiRasterPdfHasNoExtractableContent(makePdf(1,'empty'),1,plan);}
                catch(e){whiteBlocked=String(e).includes('가림');}
                if(!whiteBlocked)throw new Error('Unmasked output PDF was accepted');
                pass('actual-unmasked-pdf-rejected');

                let textBlocked=false;
                try{await verifyPsiRasterPdfHasNoExtractableContent(makePdf(1,'text'),1,plan);}
                catch(e){textBlocked=String(e).includes('원문')||String(e).includes('주석');}
                if(!textBlocked)throw new Error('Selectable text was accepted');
                pass('actual-selectable-text-rejected');

                // Full browser persistence path: real JSZip compression, decode
                // the downloaded Blob, re-open embedded PDF with PDF.js.
                // In-memory saveAs stub avoids writing outside the CI sandbox.
                const sourceBytes=makePdf(1,'text');
                const blackBytes=makePdf(1,'black');
                const toHash=async bytes=>{
                    const digest=await crypto.subtle.digest('SHA-256',bytes);
                    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
                };
                const originalHash=await toHash(sourceBytes);
                const outputHash=await toHash(blackBytes);
                const originalFile=new File([sourceBytes],'synthetic-original.pdf',{type:'application/pdf'});
                const maskedPdf=new Blob([blackBytes],{type:'application/pdf'});
                const audit={
                    schema:'psi-pdf-raster-review-v1',
                    status:'INTERNAL_RASTER_PDF_REVIEW_NOT_APPROVED',
                    preparedAt:'2026-11-01T00:00:00.000Z',
                    originalSha256:originalHash,
                    rasterPdfSha256:outputHash,
                    pageCount:1,
                    pageSummaries:[{
                        pageNumber:1,maskedAreas:1,rasterWidth:1200,
                        rasterHeight:1600,reviewedByUser:true,
                    }],
                    originalDocumentEmbedded:false,selectableOriginalText:false,
                    originalAttachmentsCopied:false,originalAnnotationsCopied:false,
                    originalMetadataCopied:false,humanReviewRequired:true,
                    disclosureApproved:false,recipientDeliveryRecorded:false,
                    warning:'Synthetic data: never approve external disclosure.',
                };
                const prepared={blob:maskedPdf,fileName:'synthetic-final.pdf',manifest:audit};
                const writes=[];
                window.saveAs=(blob,name)=>writes.push({blob,name});
                const reviewed=await downloadPreparedPsiRasterPdfReview(prepared,[1],originalFile);
                if(writes.length!==1||!writes[0].name.endsWith('.zip')||
                    writes[0].blob.type!=='application/zip')
                    throw new Error('Expected precisely one local ZIP download');
                pass('single-download-using-real-jszip');

                const archive=await window.JSZip.loadAsync(writes[0].blob);
                const zipNames=Object.keys(archive.files).sort();
                const required=['PSI_MASKED_REVIEW.pdf','REVIEW_MANIFEST.json','SHA256SUMS.txt'];
                if(zipNames.join('|')!==required.sort().join('|'))
                    throw new Error('Unexpected ZIP content or unprotected extra entry');
                const pdfBytes=await archive.file('PSI_MASKED_REVIEW.pdf').async('uint8array');
                const json=await archive.file('REVIEW_MANIFEST.json').async('string');
                const sums=await archive.file('SHA256SUMS.txt').async('string');
                if(await toHash(pdfBytes)!==outputHash||
                    await toHash(new TextEncoder().encode(json))===outputHash)
                    throw new Error('Reopened ZIP contains unexpected PDF or JSON bytes');
                const record=JSON.parse(json);
                if(record.rasterPdfSha256!==outputHash||
                    record.originalSha256!==originalHash||
                    record.finalComparison?.comparedPages?.join(',')!=='1'||
                    record.disclosureApproved!==false||
                    record.finalComparison?.independentlyApproved!==false)
                    throw new Error('ZIP manifest was altered or falsely approved');
                if(sums!==outputHash+'  PSI_MASKED_REVIEW.pdf\n'
                    +(await toHash(new TextEncoder().encode(json)))+'  REVIEW_MANIFEST.json\n')
                    throw new Error('ZIP internal checksum file mismatch');
                pass('unzip-and-verify-three-real-entries');

                // A user may later select the ZIP from a phone download folder.
                const downloaded=new File([writes[0].blob],'saved-psi-review.zip',{type:'application/zip'});
                const local=await verifyPsiSavedReviewZipLocally(downloaded,originalHash);
                if(!local.verified||!local.boundToOpenSource||local.pageCount!==1||
                    local.rasterPdfSha256!==outputHash||local.disclosureApproved!==false)
                    throw new Error('Downloaded ZIP local re-import verification failed');
                pass('reimport-real-downloaded-zip-with-source-binding');

                const alteredZip=await window.JSZip.loadAsync(writes[0].blob);
                alteredZip.file('PSI_MASKED_REVIEW.pdf',makePdf(1,'empty'));
                let mutatedRejected=false;
                try{
                    const altered=await alteredZip.generateAsync({type:'blob'});
                    await verifyPsiSavedReviewZipLocally(new File([altered],'tampered.zip'));
                }catch(e){mutatedRejected=String(e).includes('SHA-256');}
                if(!mutatedRejected)throw new Error('Tampered ZIP content reimport was accepted');
                pass('tampered-zip-reimport-rejected');

                const extraZip=await window.JSZip.loadAsync(writes[0].blob);
                extraZip.file('UNMASKED_ORIGINAL.pdf',sourceBytes);
                let extraRejected=false;
                try{
                    const extraFile=await extraZip.generateAsync({type:'blob'});
                    await verifyPsiSavedReviewZipLocally(new File([extraFile],'extra.zip'));
                }catch(e){extraRejected=String(e).includes('허용되지 않은');}
                if(!extraRejected)throw new Error('ZIP with original/unreviewed files was accepted');
                pass('unreviewed-zip-attachment-rejected');


                await verifyPsiRasterPdfHasNoExtractableContent(pdfBytes,1,plan);
                pass('reopen-downloaded-pdf-and-verify-blackout');

                const corruptedFile=new File([makePdf(1,'empty')],'swapped.pdf',{type:'application/pdf'});
                let tamperingBlocked=false;
                try{await downloadPreparedPsiRasterPdfReview(prepared,[1],corruptedFile);}
                catch(e){tamperingBlocked=String(e).includes('SHA-256');}
                if(!tamperingBlocked||writes.length!==1)
                    throw new Error('Tampered input unexpectedly triggered download');
                pass('no-download-after-original-tamper');

                return {status:'PASS',cases,syntheticOnly:true,realWorkerRecords:false,paidAiCalls:0};
            });
            results.push({device:configuration.name,...result});
            console.log('[psi-pdf] '+configuration.name+' PASS '+result.cases.length+' synthetic real-PDF checks');
        }catch(error){
            const failure={device:configuration.name,status:'FAIL',error:String(error)};
            results.push(failure);
            console.error('[psi-pdf] '+configuration.name+' FAIL '+String(error));
        }finally{await context.close();}
    }
}finally{
    if(browser)await browser.close();
    await server.close();
    const report={generatedAt:new Date().toISOString(),syntheticOnly:true,
        actualDevicesTested:false,results,
        status:results.length===2&&results.every(r=>r.status==='PASS')?'PASS':'FAIL'};
    await writeFile(outDir+'/browser-real-pdf.json',JSON.stringify(report,null,2)+'\n');
    if(report.status!=='PASS')process.exitCode=1;
}
