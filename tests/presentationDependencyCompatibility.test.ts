import { expect, it } from 'vitest';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';

it('exports an embedded image after the image-size security override', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const presentation = new pptxgen();
    const slide = presentation.addSlide();
    slide.addText('PSI export compatibility', { x: 1, y: 1, w: 5, h: 1 });
    slide.addImage({ data: `data:image/png;base64,${png}`, x: 1, y: 2, w: 1, h: 1 });
    const bytes = await presentation.write({ outputType: 'nodebuffer' });
    const archive = await JSZip.loadAsync(bytes);
    const embeddedImage = Object.values(archive.files).find(file => file.name.startsWith('ppt/media/') && file.name.endsWith('.png'));
    expect(embeddedImage).toBeDefined();
    expect(await embeddedImage!.async('base64')).toBe(png);
    expect(await archive.file('ppt/slides/slide1.xml')!.async('text')).toContain('PSI export compatibility');
});
