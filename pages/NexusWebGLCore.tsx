import React, { useEffect, useRef, useState } from 'react';

type Props = {
  active: number;
  paused: boolean;
  reduced: boolean;
  fallback: React.ReactNode;
  sequenceNonce?: number;
  cinematicActive?: boolean;
  yaw?: number;
  pitch?: number;
  layerTone?: 'gold' | 'cyan' | 'violet';
  nodeVecs?: readonly [number, number, number][];
  alertLevel?: number;
  alertVec?: readonly [number, number, number];
  zoomScale?: number;
  animationMode?: number;
  constellationStars?: readonly { x: number; y: number; mag: 1 | 2 | 3 }[];
  constellationEdges?: readonly [number, number][];
};

/**
 * Native WebGL 1 particle & geodesic renderer: additive soft sprites,
 * holographic latitude/meridian geodesic rings, surface target beacons,
 * and independent orbital planes.
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
uniform float u_yaw;
uniform float u_pitch;
uniform float u_tone;
uniform float u_bloom;
uniform float u_intensity;
uniform float u_story;
uniform vec3 u_activeVec;
uniform float u_pulse;
uniform float u_animMode;
uniform float u_alertLevel;
uniform vec3 u_alertVec;
uniform float u_zoom;
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
  float ring = kind >= 3.5 && kind < 6.5 ? kind-4.0 : kind-1.0;
  bool isAnchor = kind >= 3.5 && kind < 6.5;
  bool isGeodesic = kind >= 6.5 && kind < 7.5;
  bool isSurfaceNode = kind >= 7.5 && kind < 9.5;
  bool isActiveNode = kind >= 8.5 && kind < 9.5;
  bool isDataArc = kind >= 9.5 && kind < 10.5;
  bool isPhoton = kind >= 10.5 && kind < 11.5;
  bool isConstEdge = kind >= 11.5 && kind < 12.5;
  bool isConstStar = kind >= 12.5 && kind < 14.5;
  bool isBgStar = kind >= 14.5 && kind < 15.5;
  bool isConstDust = kind >= 15.5;
  vec3 p = a_data.xyz;
  float t = u_time;
  float reveal = 1.0;
  if(kind < 0.5 || isGeodesic || isSurfaceNode || isDataArc || isPhoton || isConstEdge || isConstStar || isConstDust) {
    float depthYaw = u_yaw + t*0.24 + u_focus*0.04;
    float depthPitch = u_pitch + sin(t*.35)*.08;
    if(isSurfaceNode || isDataArc || isPhoton || isConstEdge || isConstStar || isConstDust) {
      depthYaw = u_yaw;
      depthPitch = u_pitch;
    }
    if(u_story >= 0.0) {
      float sweep=smoothstep(0.0,12.0,u_story);
      depthYaw += .79*sweep;
      depthPitch += .21*sin(sweep*3.14159265);
      p *= mix(.82,1.0,smoothstep(0.0,2.4,u_story));
    }
    p = yawPitch(p, depthYaw, depthPitch);
    float pulseScale = (isSurfaceNode || isDataArc || isPhoton || isConstEdge || isConstStar || isConstDust) ? (isActiveNode ? 1.04 : 1.0) : .83*(1.0 + .022*sin(t*2.0+seed*24.0));
    p *= pulseScale;
  } else if(isBgStar) {
    p = yawPitch(p, u_yaw * 0.14 + t * 0.018, u_pitch * 0.12);
  } else {
    float azimuth = ring < .5 ? .55 : ring < 1.5 ? -.91 : 1.18;
    float speed = ring < .5 ? .37 : ring < 1.5 ? -.25 : .16;
    if(isAnchor) {
      float phase=seed*PI*2.0 + t*(ring < .5 ? .52 : ring < 1.5 ? -.47 : .33);
      float orbitRadius=length(p.xy);
      p=vec3(cos(phase)*orbitRadius,sin(phase)*orbitRadius,0.0);
    }
    p=yawPitch(p,t*speed+ring*.82+u_yaw*.45+u_focus*.043,azimuth+u_pitch*.35);
    reveal=u_story < 0.0 ? 1.0 : mix(.22,1.0,smoothstep(1.3+ring*.44,5.4+ring*.32,u_story));
  }
  float lens = 2.95/(2.95-p.z*.43);
  float breathing = 1.0 + .034*sin(t*.22) + .016*sin(t*.45);
  float radius = min(u_size.x*.31,u_size.y*.365)*breathing*clamp(u_zoom, 0.78, 1.38);
  if(u_story>=0.0) {
    float sweep=smoothstep(0.0,12.0,u_story);
    radius *= 1.0 + .11*sin(sweep*3.14159265);
  }
  vec2 screen = p.xy*radius*lens;
  screen.x += sin(t*.31)*radius*.024;
  screen.y += cos(t*.22)*radius*.018;
  if(u_story >= 0.0) {
    screen.x += sin(u_story*.48)*radius*.095;
    screen.y += (smoothstep(0.0,6.0,u_story)-.5)*radius*.083;
  }
  gl_Position=vec4(screen.x/(u_size.x*.5),-screen.y/(u_size.y*.5),0.,1.);
  vec3 goldBase = vec3(1.0, 0.77, 0.42);
  vec3 champagneGold = vec3(1.0, 0.89, 0.66);
  vec3 cyanBase = vec3(0.36, 0.90, 0.96);
  vec3 violetBase = vec3(0.80, 0.66, 0.99);
  vec3 layerAccent = u_tone > 1.5 ? violetBase : u_tone > 0.5 ? cyanBase : goldBase;
  if(kind < .5) {
    float near = clamp((p.z+1.)*.5,0.,1.);
    float rim = pow(clamp(1.0 - abs(p.z), 0.0, 1.0), 2.15);
    float resDot = clamp(dot(normalize(a_data.xyz), u_activeVec), -0.9999, 0.9999);
    float activeAngle = acos(resDot);
    float resWave = smoothstep(0.48, 0.995, resDot) * (0.5 + 0.5 * sin(activeAngle * 18.0 - t * 3.4));
    float ringTravel = (1.0 - clamp(u_pulse, 0.0, 1.0)) * 2.35;
    float clickRipple = clamp(u_pulse, 0.0, 1.0) * exp(-pow(activeAngle - ringTravel, 2.0) * 16.0);
    float az = atan(a_data.x, a_data.z + 0.0001);
    float modeShimmer = 0.0;
    if (u_animMode < 0.5) {
      modeShimmer = exp(-pow(sin(az - t * 1.45), 2.0) * 12.0) * 0.42;
    } else if (u_animMode < 1.5) {
      modeShimmer = pow(abs(cos(a_data.y * 10.0 - t * 2.6) * cos(az * 4.0 + t * 1.5)), 3.0) * 0.46;
    } else if (u_animMode < 2.5) {
      modeShimmer = (0.5 + 0.5 * sin(t * 1.45 - length(a_data.xy) * 2.5)) * 0.36;
    } else if (u_animMode < 3.5) {
      modeShimmer = (exp(-pow(activeAngle - 0.36, 2.0) * 85.0) + exp(-pow(activeAngle - 0.72, 2.0) * 85.0)) * 0.48;
    } else if (u_animMode < 4.5) {
      modeShimmer = (0.5 + 0.5 * sin(-a_data.y * 9.0 - t * 3.6 + seed * 6.283)) * 0.38;
    } else {
      modeShimmer = pow(abs(sin(a_data.x * 9.0 + t * 0.85) * sin(a_data.y * 9.0 - t * 0.85)), 2.0) * 0.44;
    }
    float alertDot = clamp(dot(normalize(a_data.xyz), u_alertVec), -0.9999, 0.9999);
    float alertWave = clamp(u_alertLevel, 0.0, 1.0) * smoothstep(0.32, 0.99, alertDot) * (0.55 + 0.45 * sin(acos(alertDot) * 14.0 - t * 5.2));
    vec3 alertCrimson = vec3(1.0, 0.34, 0.38);
    vec3 deepBronze = vec3(0.38, 0.23, 0.11);
    vec3 richAmber = vec3(1.0, 0.77, 0.42);
    vec3 hotChampagne = vec3(1.0, 0.92, 0.72);
    vec3 frontGold = mix(richAmber, hotChampagne, 0.48 + rim * 0.62);
    vec3 depthGold = mix(deepBronze, frontGold, pow(near, 0.82));
    float sparkle = step(0.88, seed) * pow(0.5 + 0.5 * sin(t * 3.2 + seed * 113.0), 10.0);
    float aurora = kind > .1 ? (0.35 + 0.35 * sin(t * 1.1 + a_data.y * 5.0 + seed * 6.283)) : 0.0;
    vec3 baseCol = seed < .08 ? cyanBase : seed > .86 ? mix(hotChampagne, layerAccent, 0.36) : depthGold;
    baseCol = mix(baseCol, mix(hotChampagne, layerAccent, 0.48), aurora * 0.42);
    vec3 litCol = mix(baseCol, mix(hotChampagne, layerAccent, 0.35), resWave * 0.54);
    litCol = mix(litCol, mix(hotChampagne, layerAccent, 0.44), modeShimmer * 0.46);
    litCol = mix(litCol, vec3(1.0, 0.96, 0.84), clickRipple * 0.68 + sparkle * 0.72);
    v_color = mix(litCol, alertCrimson, alertWave * 0.68);
    v_alpha = mix(.22,.88,near)*(0.70 + .30*sin(t*1.6+seed*31.0)*sin(t*1.6+seed*31.0)) * (kind > .1 ? .38 : 0.94) * (1.0 + rim * 0.28 + sparkle * 0.45 + resWave * 0.18 + modeShimmer * 0.22 + clickRipple * 0.32 + alertWave * 0.12) * u_intensity;
    gl_PointSize = u_ratio*lens*(u_bloom > .5 ? 13.5+seed*11.5 : 1.5+seed*2.3)*(1.0 + sparkle * 0.55 + resWave * 0.24 + modeShimmer * 0.20 + clickRipple * 0.45 + alertWave * 0.18);
  } else if(isGeodesic) {
    float near = clamp((p.z+1.2)*.45,0.16,1.0);
    float geoPulse = 0.78 + 0.22 * sin(t * 2.2 + seed * 18.84);
    v_color = mix(seed > 0.5 ? layerAccent : champagneGold, vec3(1.0, 0.38, 0.42), clamp(u_alertLevel, 0.0, 1.0) * 0.42);
    v_alpha = near * 0.50 * geoPulse * u_intensity;
    gl_PointSize = u_ratio * 1.6;
  } else if(isSurfaceNode) {
    float front = clamp((p.z+1.1)*.5, 0.18, 1.0);
    v_color = isActiveNode ? vec3(1.0, 0.86, 0.55) : layerAccent;
    v_alpha = clamp((isActiveNode ? 0.92 : 0.68) * front * u_intensity, 0.15, 0.94);
    gl_PointSize = u_ratio*lens*(isActiveNode ? (u_bloom > .5 ? 36.0 : 8.2) : (u_bloom > .5 ? 20.0 : 5.0));
  } else if(isDataArc) {
    float front = clamp((p.z+1.0)*.52, 0.12, 1.0);
    float packetWave = 0.5 + 0.5 * sin(seed * 12.56 - t * 3.8);
    v_color = mix(champagneGold, cyanBase, seed * 0.65);
    v_alpha = front * (0.20 + packetWave * 0.22) * u_intensity;
    gl_PointSize = u_ratio * 1.4;
  } else if(isPhoton) {
    float front = clamp((p.z+1.1)*.55, 0.22, 1.0);
    float pulse = 0.65 + 0.35 * sin(t * 4.5 + seed * 6.2831);
    v_color = seed > 0.5 ? cyanBase : champagneGold;
    v_alpha = clamp(0.68 * front * pulse * u_intensity, 0.12, 0.82);
    gl_PointSize = u_ratio*lens*(u_bloom > .5 ? 16.0 : 4.2);
  } else if(isConstEdge) {
    float front = smoothstep(-0.42, 0.25, p.z);
    float glint = 0.82 + 0.18 * sin(t * 2.2 + seed * 6.2831);
    vec3 iceCyan = vec3(0.56, 0.93, 1.0);
    vec3 prismViolet = vec3(0.84, 0.80, 1.0);
    v_color = mix(iceCyan, prismViolet, 0.35 + 0.35 * sin(seed * 6.2831));
    v_alpha = front * 0.96 * glint * u_intensity;
    gl_PointSize = u_ratio * 1.6;
  } else if(isConstStar) {
    bool isAlphaStar = kind >= 13.5;
    float front = smoothstep(-0.40, 0.22, p.z);
    float twinkle = 0.84 + 0.16 * sin(t * 2.8 + seed * 6.2831);
    vec3 iceWhite = vec3(0.95, 0.99, 1.0);
    vec3 glacialCyan = vec3(0.56, 0.93, 1.0);
    v_color = isAlphaStar ? iceWhite : mix(iceWhite, glacialCyan, 0.42);
    v_alpha = clamp((isAlphaStar ? 1.0 : 0.95) * front * twinkle * u_intensity, 0.12, 1.0);
    gl_PointSize = u_ratio * lens * (isAlphaStar ? (u_bloom > .5 ? 52.0 : 26.0) : (u_bloom > .5 ? 32.0 : 15.0));
  } else if(isBgStar) {
    float twinkle = 0.55 + 0.45 * sin(t * 1.4 + seed * 47.0);
    v_color = seed > 0.65 ? vec3(0.84, 0.94, 1.0) : vec3(1.0, 0.93, 0.80);
    v_alpha = (0.16 + 0.42 * seed * twinkle) * u_intensity;
    gl_PointSize = u_ratio * (u_bloom > .5 ? 8.5 : 1.7 + seed * 1.6);
  } else if(isConstDust) {
    float front = smoothstep(-0.35, 0.28, p.z);
    float wave = pow(max(0.0, sin(seed * 6.2831 - t * 2.4)), 4.0);
    v_color = mix(vec3(0.94, 0.99, 1.0), vec3(0.56, 0.93, 1.0), 0.48);
    v_alpha = front * (0.28 + 0.72 * wave) * u_intensity;
    gl_PointSize = u_ratio * lens * (u_bloom > .5 ? 18.0 : 3.4 + 3.6 * wave);
  } else {
    float travel=fract(seed-t*(.078+ring*.018)-ring*.23);
    float arc=min(travel,1.0-travel);
    float spark=exp(-arc*arc*420.0)*1.35;
    vec3 ringColor=ring > 1.5 ? cyanBase : ring > 0.5 ? mix(goldBase, layerAccent, 0.5) : goldBase;
    v_color=isAnchor ? vec3(1.,.88,.60) : mix(ringColor,vec3(1.,.92,.72),spark*.52);
    v_alpha=isAnchor
      ? clamp((.74+.20*sin(t*1.7+seed*PI*2.0))*reveal*u_intensity,0.0,.95)
      : clamp(mix(.30,.68,clamp((p.z+2.8)/5.6,0.,1.))
        * (.76+spark*.92)*reveal*u_intensity,0.0,.92);
    gl_PointSize=u_ratio*lens*(isAnchor
      ? (u_bloom>.5 ? 48.0 : 7.0)
      : (u_bloom>.5 ? 11.5+spark*5.5 : 2.0+spark*2.1));
  }
  v_kind = kind;
}`;
const FRAGMENT = `
precision mediump float;
uniform float u_bloom;
uniform float u_line;
uniform float u_intensity;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
void main() {
  if(u_line > .5) {
    float boost = v_kind >= 11.5 ? 1.85 : 1.0;
    gl_FragColor=vec4(v_color*(v_kind >= 11.5 ? .92 : .76), min(.96, v_alpha*.46*boost));
    return;
  }
  vec2 p=gl_PointCoord*2.-1.;
  float r2=dot(p,p);
  if(r2>1.0) discard;
  if(u_bloom > .5) {
    float glow=exp(-r2*5.4)*.32;
    gl_FragColor=vec4(v_color*glow, v_alpha*.36);
  } else {
    if(v_kind >= 12.5 && v_kind < 14.5) {
      float crystal = abs(p.x) * 1.18 + abs(p.y);
      float glassFacet = smoothstep(0.42, 0.14, crystal);
      float facetEdge = smoothstep(0.44, 0.36, crystal) - smoothstep(0.32, 0.24, crystal);
      float axisFlare = exp(-abs(p.x)*8.2 - abs(p.y)*1.8) + exp(-abs(p.y)*8.2 - abs(p.x)*1.8);
      vec2 d = vec2(p.x - p.y, p.x + p.y) * 0.7071;
      float diagFlare = 0.52 * (exp(-abs(d.x)*9.2 - abs(d.y)*2.2) + exp(-abs(d.y)*9.2 - abs(d.x)*2.2));
      vec3 prismFire = mix(vec3(0.56, 0.93, 1.0), vec3(0.86, 0.78, 1.0), clamp(p.x * 0.5 + 0.5, 0.0, 1.0));
      vec3 facetCol = mix(prismFire, vec3(1.0), glassFacet * 0.78 + facetEdge * 0.55);
      float core = smoothstep(.18, .02, sqrt(r2));
      float totalA = clamp(glassFacet * 0.72 + facetEdge * 0.65 + (axisFlare + diagFlare) * 0.48 + core, 0.0, 1.0);
      gl_FragColor = vec4(mix(v_color, facetCol, 0.75) * (core * 1.1 + glassFacet * 0.8 + (axisFlare + diagFlare) * 0.75), v_alpha * totalA);
      return;
    }
    float core=smoothstep(.38,.04,sqrt(r2));
    float fringe=exp(-r2*5.1)*.31;
    gl_FragColor=vec4(v_color*(core+fringe),v_alpha*(core+.17*fringe));
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

const DEFAULT_NODE_VECS: readonly [number, number, number][] = [
  [-0.696, -0.469, 0.544],
  [0.663, -0.5, 0.557],
  [0.95, 0.035, 0.309],
  [0.568, 0.53, 0.63],
  [-0.644, 0.5, 0.579],
];

const WebGLNexusCore: React.FC<Props> = ({
  active,
  paused,
  reduced,
  fallback,
  sequenceNonce = 0,
  cinematicActive = false,
  yaw = 0,
  pitch = 0.22,
  layerTone = 'gold',
  nodeVecs = DEFAULT_NODE_VECS,
  alertLevel = 0,
  alertVec = DEFAULT_NODE_VECS[0],
  zoomScale = 1,
  animationMode = 0,
  constellationStars = [],
  constellationEdges = [],
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const focus = useRef(active);
  const targetYaw = useRef(yaw);
  const targetPitch = useRef(pitch);
  const toneRef = useRef(layerTone === 'violet' ? 2 : layerTone === 'cyan' ? 1 : 0);
  const alertLevelRef = useRef(alertLevel);
  const alertVecRef = useRef(alertVec);
  const zoomRef = useRef(zoomScale);
  const animModeRef = useRef(animationMode);
  const repaint = useRef<() => void>(() => {});
  const story = useRef<{ active: boolean; started: number }>({ active: false, started: 0 });
  const pulseRef = useRef<{ started: number }>({ started: 0 });

  useEffect(() => {
    story.current.active = cinematicActive && !reduced;
    if (cinematicActive && sequenceNonce > 0) story.current.started = performance.now();
    repaint.current();
  }, [cinematicActive, sequenceNonce, reduced]);

  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    focus.current = active;
    if (!paused && !reduced) {
      pulseRef.current.started = performance.now();
    } else {
      pulseRef.current.started = 0;
    }
    repaint.current();
  }, [active, layerTone, paused, reduced]);

  useEffect(() => {
    targetYaw.current = yaw;
    targetPitch.current = pitch;
    toneRef.current = layerTone === 'violet' ? 2 : layerTone === 'cyan' ? 1 : 0;
    alertLevelRef.current = alertLevel;
    alertVecRef.current = alertVec;
    zoomRef.current = zoomScale;
    animModeRef.current = animationMode;
    repaint.current();
  }, [yaw, pitch, layerTone, alertLevel, alertVec, zoomScale, animationMode]);

  useEffect(() => {
    if (unavailable) return;
    const canvas = ref.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let phase = 0.3;
    let focusValue = focus.current;
    let currentYaw = targetYaw.current;
    let currentPitch = targetPitch.current;
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
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
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
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const cores = navigator.hardwareConcurrency;
      const lowBudget =
        mobile &&
        ((typeof memory === 'number' && memory <= 3) || (typeof cores === 'number' && cores <= 4));
      const shellCount = lowBudget ? 1350 : mobile ? 2400 : 6500;
      const ringCount = lowBudget ? 170 : mobile ? 230 : 480;
      const geoSegments = lowBudget ? 72 : mobile ? 96 : 160;
      canvas.dataset.lod = lowBudget ? 'mobile-conservative' : mobile ? 'mobile-standard' : 'desktop';
      const raw: number[] = [];
      const phi = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < shellCount; i++) {
        const y = 1 - ((i + 0.5) * 2) / shellCount,
          r = Math.sqrt(Math.max(0, 1 - y * y));
        const angle = i * phi;
        const seed = ((i * 67) % 997) / 997;
        raw.push(Math.cos(angle) * r, y, Math.sin(angle) * r, seed, 0);
      }
      const interiorCount = lowBudget ? 520 : mobile ? 950 : 3400;
      for (let i = 0; i < interiorCount; i++) {
        const y = 1 - ((i + 0.5) * 2) / interiorCount;
        const t = i * phi * 1.43;
        const shellRadius = Math.sqrt(Math.max(0, 1 - y * y));
        const radial = Math.pow(((i * 137 + 71) % 1009) / 1009, 1.35) * 0.92;
        const seed = ((i * 73 + 251) % 997) / 997;
        raw.push(Math.cos(t) * shellRadius * radial, y * radial, Math.sin(t) * shellRadius * radial, seed, 0.2);
      }
      const orbitRadii = [1.68, 2.02, 2.37] as const;
      for (let ring = 0; ring < 3; ring++) {
        const radius = orbitRadii[ring];
        for (let j = 0; j < ringCount; j++) {
          const angle = (j / ringCount) * Math.PI * 2;
          raw.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0, j / ringCount, ring + 1);
        }
        for (const p of [0.13, 0.63]) {
          raw.push(radius, 0, 0, p, ring + 4);
        }
      }
      // Holographic geodesic latitude and meridian rings on the sphere surface
      const geoStart = raw.length / 5;
      const geoRingLats = [0, 0.58, -0.58];
      for (let g = 0; g < geoRingLats.length; g++) {
        const lat = geoRingLats[g];
        const r = Math.cos(lat) * 1.03;
        const y = Math.sin(lat) * 1.03;
        for (let j = 0; j < geoSegments; j++) {
          const a = (j / geoSegments) * Math.PI * 2;
          raw.push(Math.cos(a) * r, y, Math.sin(a) * r, g === 0 ? 0.75 : 0.25, 7);
        }
      }
      // Two orthogonal meridian rings
      for (let m = 0; m < 2; m++) {
        const lonOffset = m * (Math.PI * 0.5);
        for (let j = 0; j < geoSegments; j++) {
          const a = (j / geoSegments) * Math.PI * 2;
          const x = Math.cos(a) * Math.sin(lonOffset) * 1.03;
          const y = Math.sin(a) * 1.03;
          const z = Math.cos(a) * Math.cos(lonOffset) * 1.03;
          raw.push(x, y, z, 0.6, 7);
        }
      }
      const geoRingTotal = geoRingLats.length + 2;
      // Surface node beacons
      const safeNodes = nodeVecs.length ? nodeVecs : DEFAULT_NODE_VECS;
      for (let idx = 0; idx < safeNodes.length; idx++) {
        const [nx, ny, nz] = safeNodes[idx];
        raw.push(nx * 1.08, ny * 1.08, nz * 1.08, idx / Math.max(1, safeNodes.length), idx === active ? 9 : 8);
      }
      // 3D Great-Circle Data Arcs & Flowing Photon Streams connecting closed-loop nodes
      const arcPairs: [number, number][] = [];
      const activeIdx = Math.max(0, Math.min(safeNodes.length - 1, active));
      for (let idx = 0; idx < safeNodes.length && arcPairs.length < 4; idx++) {
        arcPairs.push([idx, (idx + 1) % safeNodes.length]);
      }
      if (safeNodes.length >= 4) {
        arcPairs.push([activeIdx, (activeIdx + 2) % safeNodes.length]);
        arcPairs.push([activeIdx, (activeIdx + safeNodes.length - 2) % safeNodes.length]);
      }
      const arcSegments = lowBudget ? 18 : mobile ? 24 : 36;
      const arcStart = raw.length / 5;
      const arcSamples: { x: number; y: number; z: number }[][] = [];
      for (let pIdx = 0; pIdx < arcPairs.length; pIdx++) {
        const [fromIdx, toIdx] = arcPairs[pIdx];
        const a = safeNodes[fromIdx];
        const b = safeNodes[toIdx];
        const curvePts: { x: number; y: number; z: number }[] = [];
        for (let s = 0; s < arcSegments; s++) {
          const u = s / (arcSegments - 1);
          const mx = a[0] + (b[0] - a[0]) * u;
          const my = a[1] + (b[1] - a[1]) * u;
          const mz = a[2] + (b[2] - a[2]) * u;
          const len = Math.hypot(mx, my, mz) || 1;
          const elev = 1.06 + 0.34 * Math.sin(Math.PI * u);
          const vx = (mx / len) * elev;
          const vy = (my / len) * elev;
          const vz = (mz / len) * elev;
          raw.push(vx, vy, vz, u, 10);
          curvePts.push({ x: vx, y: vy, z: vz });
        }
        arcSamples.push(curvePts);
      }
      // Static photon anchor vertices at key arc mid-points (plus smooth GPU travel wave)
      for (let pIdx = 0; pIdx < arcSamples.length; pIdx++) {
        const curve = arcSamples[pIdx];
        const idxA = Math.floor(curve.length * 0.35);
        const idxB = Math.floor(curve.length * 0.72);
        const pa = curve[idxA] ?? curve[0];
        const pb = curve[idxB] ?? curve[0];
        if (pa) raw.push(pa.x, pa.y, pa.z, 0.25 + pIdx * 0.1, 11);
        if (pb) raw.push(pb.x, pb.y, pb.z, 0.75 + pIdx * 0.1, 11);
      }

      // Distant deep-space celestial starfield with gentle parallax
      const bgStarCount = lowBudget ? 55 : mobile ? 80 : 160;
      for (let bIdx = 0; bIdx < bgStarCount; bIdx++) {
        const sA = ((bIdx * 97 + 19) % 1009) / 1009;
        const sB = ((bIdx * 193 + 53) % 1013) / 1013;
        const sC = ((bIdx * 311 + 89) % 997) / 997;
        const bx = (sA - 0.5) * 5.6;
        const by = (sB - 0.5) * 4.2;
        const bz = -1.8 + sC * 1.2;
        raw.push(bx, by, bz, ((bIdx * 61) % 997) / 997, 15);
      }

      // Grand 3D Astronomical Constellation crowning the front hemisphere around & above the active node
      const constEdgeStart = raw.length / 5;
      let constEdgeVertexCount = 0;
      if (constellationStars.length > 0) {
        const centerRaw = safeNodes[activeIdx] ?? DEFAULT_NODE_VECS[0];
        const cLen = Math.hypot(centerRaw[0], centerRaw[1], centerRaw[2]) || 1;
        const centerN: [number, number, number] = [centerRaw[0] / cLen, centerRaw[1] / cLen, centerRaw[2] / cLen];
        const crownRaw: [number, number, number] = [
          centerN[0] * 0.35,
          centerN[1] * 0.35 - 0.18,
          Math.max(0.75, Math.abs(centerN[2]) + 0.45),
        ];
        const crLen = Math.hypot(crownRaw[0], crownRaw[1], crownRaw[2]) || 1;
        const N: [number, number, number] = [crownRaw[0] / crLen, crownRaw[1] / crLen, crownRaw[2] / crLen];
        const refUp: [number, number, number] = Math.abs(N[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
        const uxRaw: [number, number, number] = [
          refUp[1] * N[2] - refUp[2] * N[1],
          refUp[2] * N[0] - refUp[0] * N[2],
          refUp[0] * N[1] - refUp[1] * N[0],
        ];
        const uLen = Math.hypot(uxRaw[0], uxRaw[1], uxRaw[2]) || 1;
        const tangentU: [number, number, number] = [uxRaw[0] / uLen, uxRaw[1] / uLen, uxRaw[2] / uLen];
        const vxRaw: [number, number, number] = [
          N[1] * tangentU[2] - N[2] * tangentU[1],
          N[2] * tangentU[0] - N[0] * tangentU[2],
          N[0] * tangentU[1] - N[1] * tangentU[0],
        ];
        const vLen = Math.hypot(vxRaw[0], vxRaw[1], vxRaw[2]) || 1;
        const tangentV: [number, number, number] = [vxRaw[0] / vLen, vxRaw[1] / vLen, vxRaw[2] / vLen];

        const shellR = 1.3;
        const sphereStars = constellationStars.map((st) => {
          const uOff = ((st.x - 50) / 50) * 0.92;
          const vOff = ((st.y - 32) / 32) * 0.72;
          const px = N[0] + tangentU[0] * uOff + tangentV[0] * vOff;
          const py = N[1] + tangentU[1] * uOff + tangentV[1] * vOff;
          const pz = N[2] + tangentU[2] * uOff + tangentV[2] * vOff;
          const pl = Math.hypot(px, py, pz) || 1;
          return { x: (px / pl) * shellR, y: (py / pl) * shellR, z: (pz / pl) * shellR, mag: st.mag };
        });

        const constSegs = lowBudget ? 5 : 8;
        for (let eIdx = 0; eIdx < constellationEdges.length; eIdx++) {
          const [aIdx, bIdx] = constellationEdges[eIdx];
          const sa = sphereStars[aIdx];
          const sb = sphereStars[bIdx];
          if (!sa || !sb) continue;
          for (let s = 0; s < constSegs; s++) {
            const t0 = s / constSegs;
            const t1 = (s + 1) / constSegs;
            for (const tt of [t0, t1]) {
              const mx = sa.x + (sb.x - sa.x) * tt;
              const my = sa.y + (sb.y - sa.y) * tt;
              const mz = sa.z + (sb.z - sa.z) * tt;
              const ml = Math.hypot(mx, my, mz) || 1;
              const rLift = shellR + 0.02 * Math.sin(Math.PI * tt);
              raw.push((mx / ml) * rLift, (my / ml) * rLift, (mz / ml) * rLift, (eIdx + tt) / Math.max(1, constellationEdges.length), 12);
              constEdgeVertexCount += 1;
            }
          }
        }

        // Traveling stardust wave points sampled along every constellation edge (kind = 16)
        for (let eIdx = 0; eIdx < constellationEdges.length; eIdx++) {
          const [aIdx, bIdx] = constellationEdges[eIdx];
          const sa = sphereStars[aIdx];
          const sb = sphereStars[bIdx];
          if (!sa || !sb) continue;
          for (let dIdx = 0; dIdx < 4; dIdx++) {
            const tt = (dIdx + 0.5) / 4;
            const mx = sa.x + (sb.x - sa.x) * tt;
            const my = sa.y + (sb.y - sa.y) * tt;
            const mz = sa.z + (sb.z - sa.z) * tt;
            const ml = Math.hypot(mx, my, mz) || 1;
            const rLift = shellR + 0.02 * Math.sin(Math.PI * tt);
            raw.push((mx / ml) * rLift, (my / ml) * rLift, (mz / ml) * rLift, eIdx * 0.15 + tt, 16);
          }
        }

        for (let sIdx = 0; sIdx < sphereStars.length; sIdx++) {
          const st = sphereStars[sIdx];
          raw.push(st.x, st.y, st.z, sIdx / Math.max(1, sphereStars.length), st.mag === 1 ? 14 : 13);
        }
      }

      const data = new Float32Array(raw);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('GPU buffer unavailable');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.useProgram(program);
      const positionLocation = gl.getAttribLocation(program, 'a_data');
      const kindLocation = gl.getAttribLocation(program, 'a_kind');
      if (positionLocation < 0 || kindLocation < 0) throw new Error('GPU attribute missing');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 4, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(kindLocation);
      gl.vertexAttribPointer(kindLocation, 1, gl.FLOAT, false, 20, 16);
      const locSize = gl.getUniformLocation(program, 'u_size');
      const locRatio = gl.getUniformLocation(program, 'u_ratio');
      const locTime = gl.getUniformLocation(program, 'u_time');
      const locFocus = gl.getUniformLocation(program, 'u_focus');
      const locYaw = gl.getUniformLocation(program, 'u_yaw');
      const locPitch = gl.getUniformLocation(program, 'u_pitch');
      const locTone = gl.getUniformLocation(program, 'u_tone');
      const locBloom = gl.getUniformLocation(program, 'u_bloom');
      const locLine = gl.getUniformLocation(program, 'u_line');
      const locIntensity = gl.getUniformLocation(program, 'u_intensity');
      const locStory = gl.getUniformLocation(program, 'u_story');
      const locActiveVec = gl.getUniformLocation(program, 'u_activeVec');
      const locPulse = gl.getUniformLocation(program, 'u_pulse');
      const locAnimMode = gl.getUniformLocation(program, 'u_animMode');
      const locAlertLevel = gl.getUniformLocation(program, 'u_alertLevel');
      const locAlertVec = gl.getUniformLocation(program, 'u_alertVec');
      const locZoom = gl.getUniformLocation(program, 'u_zoom');

      const shortestDelta = (from: number, to: number) => {
        let d = ((to - from + Math.PI) % (Math.PI * 2));
        if (d < 0) d += Math.PI * 2;
        return d - Math.PI;
      };

      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
        canvas.width = Math.max(1, Math.round(rect.width * ratio));
        canvas.height = Math.max(1, Math.round(rect.height * ratio));
        gl!.viewport(0, 0, canvas.width, canvas.height);
        draw(ratio);
      };
      const draw = (ratio: number) => {
        if (!gl || !program || disposed || lost) return;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        focusValue =
          paused || reduced ? focus.current : focusValue + (focus.current - focusValue) * 0.08;
        currentYaw =
          paused || reduced
            ? targetYaw.current
            : currentYaw + shortestDelta(currentYaw, targetYaw.current) * 0.14;
        currentPitch =
          paused || reduced
            ? targetPitch.current
            : currentPitch + (targetPitch.current - currentPitch) * 0.14;
        gl.uniform2f(locSize, canvas.width, canvas.height);
        gl.uniform1f(locRatio, ratio);
        gl.uniform1f(locTime, phase);
        gl.uniform1f(locFocus, focusValue);
        gl.uniform1f(locYaw, currentYaw);
        gl.uniform1f(locPitch, currentPitch);
        gl.uniform1f(locTone, toneRef.current);
        const activeVec = safeNodes[Math.max(0, Math.min(safeNodes.length - 1, focus.current))] ?? DEFAULT_NODE_VECS[0];
        gl.uniform3f(locActiveVec, activeVec[0], activeVec[1], activeVec[2]);
        const pulseElapsed = !paused && !reduced && pulseRef.current.started > 0
          ? (performance.now() - pulseRef.current.started) / 1100
          : 1;
        const pulseVal = pulseElapsed >= 0 && pulseElapsed < 1 ? 1 - pulseElapsed : 0;
        gl.uniform1f(locPulse, pulseVal);
        gl.uniform1f(locAnimMode, paused || reduced ? 2 : animModeRef.current);
        gl.uniform1f(locAlertLevel, Math.max(0, Math.min(1, alertLevelRef.current)));
        const aVec = alertVecRef.current ?? DEFAULT_NODE_VECS[0];
        gl.uniform3f(locAlertVec, aVec[0], aVec[1], aVec[2]);
        gl.uniform1f(locZoom, Math.max(0.78, Math.min(1.38, zoomRef.current)));
        const storyTime = story.current.active
          ? Math.min(12, Math.max(0, (performance.now() - story.current.started) / 1000))
          : -1;
        gl.uniform1f(locStory, storyTime);
        const displayWidth = canvas.width / ratio;
        const widthFactor = Math.max(0.43, Math.pow(Math.min(1, displayWidth / 720), 0.72));
        gl.uniform1f(locIntensity, Math.min(1, widthFactor * (mobile ? 1.38 : 1)));
        gl.uniform1f(locLine, 0);
        gl.uniform1f(locBloom, 1);
        gl.drawArrays(gl.POINTS, 0, data.length / 5);
        gl.uniform1f(locBloom, 0);
        gl.drawArrays(gl.POINTS, 0, data.length / 5);

        gl.uniform1f(locLine, 1);
        const orbitStart = shellCount + interiorCount;
        for (let ring = 0; ring < 3; ring++) {
          gl.drawArrays(gl.LINE_LOOP, orbitStart + ring * (ringCount + 2), ringCount);
        }
        for (let g = 0; g < geoRingTotal; g++) {
          gl.drawArrays(gl.LINE_LOOP, geoStart + g * geoSegments, geoSegments);
        }
        for (let aIdx = 0; aIdx < arcPairs.length; aIdx++) {
          gl.drawArrays(gl.LINE_STRIP, arcStart + aIdx * arcSegments, arcSegments);
        }
        if (constEdgeVertexCount > 0) {
          gl.drawArrays(gl.LINES, constEdgeStart, constEdgeVertexCount);
        }
        gl.uniform1f(locLine, 0);
      };
      let dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
      repaint.current = () => draw(dpr);
      const tick = (now: number) => {
        if (disposed || lost || !visible || paused || reduced) return;
        if (now - lastFrame >= 33) {
          phase += Math.min(60, Math.max(0, now - last || 33)) * 0.00036;
          last = now;
          lastFrame = now;
          draw(dpr);
        }
        raf = requestAnimationFrame(tick);
      };
      const onVisibility = () => {
        visible = document.visibilityState === 'visible';
        cancelAnimationFrame(raf);
        last = 0;
        lastFrame = 0;
        if (visible && !paused && !reduced) raf = requestAnimationFrame(tick);
      };
      observer = new ResizeObserver(() => {
        dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
        resize();
      });
      observer.observe(canvas);
      document.addEventListener('visibilitychange', onVisibility);
      resize();
      if (visible && !paused && !reduced) raf = requestAnimationFrame(tick);
      return () => {
        disposed = true;
        document.removeEventListener('visibilitychange', onVisibility);
        repaint.current = () => {};
        reset();
      };
    } catch {
      reset();
      setUnavailable(true);
    }
  }, [paused, reduced, unavailable, nodeVecs, active, constellationStars, constellationEdges]);
  if (unavailable) return <>{fallback}</>;
  return <canvas ref={ref} className="nexus-core-canvas nexus-webgl-core" data-renderer="webgl" aria-hidden="true" />;
};

export default WebGLNexusCore;
