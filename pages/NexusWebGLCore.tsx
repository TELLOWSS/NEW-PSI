import React, { useEffect, useRef, useState } from 'react';

type Props = {
  active: number;
  paused: boolean;
  reduced: boolean;
  fallback: React.ReactNode;
  sequenceNonce?: number;
  cinematicActive?: boolean;
};

/**
 * Native WebGL 1 particle renderer: additive soft sprites and independent orbital planes.
 * No third-party graphics runtime, remote calls, textures, user data, or paid resources.
 * Canvas 2D fallback must remain fully usable on unsupported/blocked GPUs.
 */
const VERTEX = `
precision mediump float;
attribute vec4 a_data;
attribute float a_kind;
uniform vec2 u_size;
uniform float u_ratio;
uniform float u_time;
uniform float u_focus;
uniform float u_bloom;
uniform float u_intensity;
uniform float u_story;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
const float PI = 3.14159265;
vec3 yawPitch(vec3 p, float ay, float ax) {
  float c = cos(ay), s = sin(ay);
  vec3 y = vec3(p.x*c+p.z*s,p.y,p.z*c-p.x*s);
  c=cos(ax); s=sin(ax);
  return vec3(y.x,y.y*c-y.z*s,y.y*s+y.z*c);
}
void main() {
  float seed = a_data.w;
  float kind = a_kind;
  vec3 p = a_data.xyz;
  float t = u_time;
  float reveal=1.0;
  if(kind < 0.5) {
    float depthYaw = t*0.31 + u_focus*0.105;
    float depthPitch = .22 + sin(t*.35)*.16;
    if(u_story >= 0.0) {
      float sweep=smoothstep(0.0,12.0,u_story);
      depthYaw += .47*sweep;
      depthPitch += .13*sin(sweep*3.14159265);
      p *= mix(.80,1.0,smoothstep(0.0,2.4,u_story));
    }
    p = yawPitch(p, depthYaw, depthPitch);
    p *= 1.0 + .025*sin(t*2.0+seed*24.0);
  } else {
    float ring = kind-1.0;
    float azimuth = ring < .5 ? .45 : ring < 1.5 ? -.80 : 1.06;
    float speed = ring < .5 ? .33 : ring < 1.5 ? -.29 : .19;
    p = yawPitch(p, t*speed + ring*.82, azimuth);
    reveal = u_story < 0.0 ? 1.0 : mix(.37,1.0,smoothstep(1.4+ring*.50,4.5+ring*.50,u_story));
  }
  float lens = 2.95/(2.95-p.z*.43);
  float breathing = 1.0 + .036*sin(t*.22) + .018*sin(t*.45);
  float radius = min(u_size.x*.26,u_size.y*.29)*breathing;
  if(u_story>=0.0) {
    float sweep=smoothstep(0.0,12.0,u_story);
    radius *= 1.0 + .075*sin(sweep*3.14159265);
  }
  vec2 screen = p.xy*radius*lens;
  // A restrained dolly: source-inspired dimensional motion, never a live risk claim.
  screen.x += sin(t*.31)*radius*.026;
  screen.y += cos(t*.22)*radius*.019;
  if(u_story >= 0.0) {
    screen.x += sin(u_story*.48)*radius*.075;
    screen.y += (smoothstep(0.0,5.0,u_story)-.5)*radius*.052;
  }
  gl_Position=vec4(screen.x/(u_size.x*.5),-screen.y/(u_size.y*.5),0.,1.);
  if(kind < .5) {
    float near = clamp((p.z+1.)*.5,0.,1.);
    v_color = seed < .065 ? vec3(.27,.91,.95) : seed > .86 ? vec3(1.,.98,.82) : vec3(1.,.74,.42);
    v_alpha = mix(.25,.84,near)*(0.7 + .3*sin(t*1.6+seed*31.0)*sin(t*1.6+seed*31.0)) * (kind > .1 ? .55 : 1.0) * u_intensity;
    gl_PointSize = u_ratio*lens*(u_bloom > .5 ? 13.0+seed*11.0 : 1.4+seed*2.15);
  } else {
    float travel=fract(seed-t*.07-ring*.23);
    float arc=min(travel,1.0-travel);
    float spark=exp(-arc*arc*430.0);
    vec3 ringColor=kind > 2.5 ? vec3(.33,.82,.90) : vec3(1.,.69,.43);
    v_color=mix(ringColor,vec3(1.,.94,.75),spark*.52);
    v_alpha=clamp(mix(.21,.58,clamp((p.z+1.65)/3.3,0.,1.))
      * (0.73+spark*.72) * reveal*u_intensity,0.0,.96);
    gl_PointSize = u_ratio*lens*(u_bloom > .5 ? 9.0 : 1.65);
  }
  v_kind = kind;
}`;
const FRAGMENT = `
precision mediump float;
uniform float u_bloom;
uniform float u_intensity;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
void main() {
  vec2 p=gl_PointCoord*2.-1.;
  float r2=dot(p,p);
  if(r2>1.0) discard;
  if(u_bloom > .5) {
    float glow=exp(-r2*5.2)*.36;
    gl_FragColor=vec4(v_color*glow, v_alpha*.40);
  } else {
    float core=smoothstep(.37,.03,sqrt(r2));
    float fringe=exp(-r2*5.0)*.33;
    gl_FragColor=vec4(v_color*(core+fringe),v_alpha*(core+.18*fringe));
  }
}`;

function makeShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('GPU shader unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(error || 'Shader compile failure');
  }
  return shader;
}

const WebGLNexusCore: React.FC<Props> = ({ active, paused, reduced, fallback, sequenceNonce=0, cinematicActive=false }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const focus = useRef(active);
  const repaint = useRef<()=>void>(()=>{});
  const story = useRef<{active:boolean;started:number}>({active:false,started:0});
  useEffect(()=>{
    story.current.active=cinematicActive&&!reduced;
    if(cinematicActive && sequenceNonce>0) story.current.started=performance.now();
    repaint.current();
  },[cinematicActive,sequenceNonce,reduced]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { focus.current = active; repaint.current(); }, [active]);
  useEffect(() => {
    if (unavailable) return;
    const canvas = ref.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let phase = .3;
    let focusValue = focus.current;
    let last = 0;
    let lastFrame = 0;
    let visible = document.visibilityState === 'visible';
    let disposed = false;
    let lost = false;

    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      setUnavailable(true);
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost);
      if (gl && !lost) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
    };

    try {
      gl = canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false,
        stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false,
        powerPreference: 'low-power',
      });
      if (!gl) throw new Error('WebGL unavailable');
      canvas.addEventListener('webglcontextlost', contextLost);
      const vertex = makeShader(gl, gl.VERTEX_SHADER, VERTEX);
      const fragment = makeShader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      if (!program) throw new Error('Program unavailable');
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'GPU program link failure');
      }

      const mobile = window.matchMedia('(max-width: 700px)').matches;
      const shellCount = mobile ? 2400 : 6500;
      const ringCount = mobile ? 230 : 480;
      const raw: number[] = [];
      const phi = Math.PI*(3-Math.sqrt(5));
      for (let i=0; i<shellCount; i++) {
        const y=1-(i+.5)*2/shellCount, r=Math.sqrt(Math.max(0,1-y*y));
        const angle=i*phi;
        const seed=((i*67)%997)/997;
        raw.push(Math.cos(angle)*r,y,Math.sin(angle)*r,seed,0);
      }
      // Interior volume points prevent the sphere from becoming a hollow, edge-only halo.
      // Deterministic golden-angle distribution, denser toward the warm central nucleus.
      const interiorCount = mobile ? 950 : 3400;
      for (let i=0;i<interiorCount;i++) {
        const y=1-(i+.5)*2/interiorCount;
        const t=i*phi*1.43;
        const shellRadius=Math.sqrt(Math.max(0,1-y*y));
        const radial=Math.pow(((i*137+71)%1009)/1009,1.35)*.92;
        const seed=((i*73+251)%997)/997;
        raw.push(Math.cos(t)*shellRadius*radial,y*radial,Math.sin(t)*shellRadius*radial,seed,.2);
      }
      for (let ring=0; ring<3;ring++) {
        for (let j=0; j<ringCount;j++) {
          const a=j/ringCount*Math.PI*2;
          raw.push(Math.cos(a)*1.64,Math.sin(a)*1.64,0,((j*43+ring*79)%997)/997,ring+1);
        }
      }
      const data = new Float32Array(raw);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('GPU buffer unavailable');
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      gl.useProgram(program);
      const positionLocation = gl.getAttribLocation(program,'a_data');
      const kindLocation = gl.getAttribLocation(program,'a_kind');
      if(positionLocation<0 || kindLocation<0) throw new Error('GPU attribute missing');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation,4,gl.FLOAT,false,20,0);
      gl.enableVertexAttribArray(kindLocation);
      gl.vertexAttribPointer(kindLocation,1,gl.FLOAT,false,20,16);
      const locSize=gl.getUniformLocation(program,'u_size');
      const locRatio=gl.getUniformLocation(program,'u_ratio');
      const locTime=gl.getUniformLocation(program,'u_time');
      const locFocus=gl.getUniformLocation(program,'u_focus');
      const locBloom=gl.getUniformLocation(program,'u_bloom');
      const locIntensity=gl.getUniformLocation(program,'u_intensity');
      const locStory=gl.getUniformLocation(program,'u_story');
      const resize=()=>{
        const rect=canvas.getBoundingClientRect();
        const ratio=Math.min(window.devicePixelRatio||1,mobile?1.25:1.6);
        canvas.width=Math.max(1,Math.round(rect.width*ratio));
        canvas.height=Math.max(1,Math.round(rect.height*ratio));
        gl!.viewport(0,0,canvas.width,canvas.height);
        draw(ratio);
      };
      const draw=(ratio:number)=>{
        if(!gl||!program||disposed||lost)return;
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
        focusValue=paused||reduced ? focus.current : focusValue+(focus.current-focusValue)*.05;
        gl.uniform2f(locSize,canvas.width,canvas.height);
        gl.uniform1f(locRatio,ratio);
        gl.uniform1f(locTime,phase);
        gl.uniform1f(locFocus,focusValue);
        const storyTime=story.current.active
          ? Math.min(12,Math.max(0,(performance.now()-story.current.started)/1000))
          : -1;
        gl.uniform1f(locStory,storyTime);
        // A desktop-sized particle field shrinks dramatically during responsive testing.
        // Adapt intensity to rendered CSS width, while native mobile uses a lower particle count.
        const displayWidth=canvas.width/ratio;
        const widthFactor=Math.max(.43,Math.pow(Math.min(1,displayWidth/720),.72));
        gl.uniform1f(locIntensity,Math.min(1,widthFactor*(mobile?1.45:1)));
        gl.uniform1f(locBloom,1);
        gl.drawArrays(gl.POINTS,0,data.length/5);
        gl.uniform1f(locBloom,0);
        gl.drawArrays(gl.POINTS,0,data.length/5);
      };
      let dpr=Math.min(window.devicePixelRatio||1,mobile?1.25:1.6);
      repaint.current=()=>draw(dpr);
      const tick=(now:number)=>{
        if(disposed||lost||!visible||paused||reduced)return;
        if(now-lastFrame>=33){
          phase+=Math.min(60,Math.max(0,now-last||33))*.00036;
          last=now;
          lastFrame=now;
          draw(dpr);
        }
        raf=requestAnimationFrame(tick);
      };
      const onVisibility=()=>{
        visible=document.visibilityState==='visible';
        cancelAnimationFrame(raf);
        last=0;lastFrame=0;
        if(visible&&!paused&&!reduced)raf=requestAnimationFrame(tick);
      };
      observer=new ResizeObserver(()=>{
        dpr=Math.min(window.devicePixelRatio||1,mobile?1.25:1.6);
        resize();
      });
      observer.observe(canvas);
      document.addEventListener('visibilitychange',onVisibility);
      resize();
      if(visible&&!paused&&!reduced)raf=requestAnimationFrame(tick);
      return ()=>{
        disposed=true;
        document.removeEventListener('visibilitychange',onVisibility);
        repaint.current=()=>{};
        reset();
      };
    } catch {
      reset();
      setUnavailable(true);
    }
  }, [paused,reduced,unavailable]);
  if(unavailable)return <>{fallback}</>;
  return <canvas ref={ref} className="nexus-core-canvas nexus-webgl-core" data-renderer="webgl" aria-hidden="true"/>;
};

export default WebGLNexusCore;
