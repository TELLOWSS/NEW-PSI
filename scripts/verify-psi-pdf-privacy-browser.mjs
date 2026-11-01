import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';

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
            await page.goto('http://127.0.0.1:4198/',{waitUntil:'domcontentloaded'});
            const result=await page.evaluate(async()=>{
                const {
                    readPsiLocalPdf,verifyPsiRasterPdfHasNoExtractableContent,
                    loadPsiPdfRenderer,choosePsiPdfRenderScale,
                }=await import('/utils/psiPdfRasterReview.ts');
                const {psiMaskFromDrag,applyOpaquePsiPhotoMasks}=await import('/utils/psiPhotoMaskGeometry.ts');

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
