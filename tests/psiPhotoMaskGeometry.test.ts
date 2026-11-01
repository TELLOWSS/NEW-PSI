import {describe,it,expect} from 'vitest';
import {psiMaskFromDrag,validatePsiPhotoMasks,applyOpaquePsiPhotoMasks} from '../utils/psiPhotoMaskGeometry';

describe('PSI photo mask coordinate safety',()=>{
 it('converts pointer drag into source-resolution rectangles',()=>{
  const box={left:100,top:200,width:400,height:200};
  const r=psiMaskFromDrag({clientX:300,clientY:300},{clientX:200,clientY:250},box);
  expect(r).toEqual({x:0.25,y:0.25,width:0.25,height:0.25});
  expect(validatePsiPhotoMasks([r!],4000,2000)).toEqual([{x:1000,y:500,width:1000,height:500}]);
 });
 it('rejects zero, oversized, NaN and out-of-range rectangles',()=>{
  expect(psiMaskFromDrag({clientX:1,clientY:1},{clientX:2,clientY:2},
   {left:0,top:0,width:400,height:400})).toBeNull();
  expect(()=>validatePsiPhotoMasks([],100,100)).toThrow();
  expect(()=>validatePsiPhotoMasks([{x:0.9,y:0,width:0.2,height:0.2}],100,100)).toThrow();
  expect(()=>validatePsiPhotoMasks([{x:NaN,y:0,width:0.2,height:0.2}],100,100)).toThrow();
  expect(()=>validatePsiPhotoMasks([{x:0,y:0,width:1,height:1}],5000,5000)).toThrow();
 });
 it('applies opaque black pixel fills, not a display-only overlay',()=>{
  const calls:any[]=[];
  const context={fillStyle:'#ffffff',fillRect(x:number,y:number,w:number,h:number){
   calls.push({style:this.fillStyle,x,y,w,h});
  }};
  applyOpaquePsiPhotoMasks(context,[{x:0.2,y:0.1,width:0.4,height:0.6}],1000,500);
  expect(calls).toEqual([{style:'#000000',x:200,y:50,w:401,h:300}]);
 });
});
