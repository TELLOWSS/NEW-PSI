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
  bool isSurfaceNode = kind >= 7.5;
  bool isActiveNode = kind >= 8.5;
  vec3 p = a_data.xyz;
  float t = u_time;
  float reveal = 1.0;
  if(kind < 0.5 || isGeodesic || isSurfaceNode) {
    float depthYaw = u_yaw + t*0.24 + u_focus*0.04;
    float depthPitch = u_pitch + sin(t*.35)*.08;
    if(isSurfaceNode) {
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
    float pulseScale = isSurfaceNode ? (isActiveNode ? 1.04 : 0.98) : .83*(1.0 + .022*sin(t*2.0+seed*24.0));
    p *= pulseScale;
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
  float radius = min(u_size.x*.26,u_size.y*.29)*breathing;
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
  vec3 goldBase = vec3(1.0, 0.73, 0.39);
  vec3 cyanBase = vec3(0.28, 0.88, 0.94);
  vec3 violetBase = vec3(0.76, 0.62, 0.98);
  vec3 layerAccent = u_tone > 1.5 ? violetBase : u_tone > 0.5 ? cyanBase : goldBase;
  if(kind < .5) {
    float near = clamp((p.z+1.)*.5,0.,1.);
    float rim = pow(clamp(1.0 - abs(p.z), 0.0, 1.0), 1.6);
    v_color = seed < .08 ? cyanBase : seed > .87 ? mix(goldBase, layerAccent, 0.45) : mix(goldBase, vec3(1.0, 0.84, 0.58), rim*0.35);
    v_alpha = mix(.22,.78,near)*(0.68 + .32*sin(t*1.6+seed*31.0)*sin(t*1.6+seed*31.0)) * (kind > .1 ? .50 : 0.94) * u_intensity;
    gl_PointSize = u_ratio*lens*(u_bloom > .5 ? 12.0+seed*10.0 : 1.4+seed*2.1);
  } else if(isGeodesic) {
    float near = clamp((p.z+1.2)*.45,0.12,1.0);
    v_color = seed > 0.5 ? layerAccent : goldBase;
    v_alpha = near * 0.42 * u_intensity;
    gl_PointSize = u_ratio * 1.4;
  } else if(isSurfaceNode) {
    float front = clamp((p.z+1.1)*.5, 0.18, 1.0);
    v_color = isActiveNode ? vec3(1.0, 0.86, 0.55) : layerAccent;
    v_alpha = clamp((isActiveNode ? 0.92 : 0.68) * front * u_intensity, 0.15, 0.94);
    gl_PointSize = u_ratio*lens*(isActiveNode ? (u_bloom > .5 ? 36.0 : 8.2) : (u_bloom > .5 ? 20.0 : 5.0));
  } else {
    float travel=fract(seed-t*(.078+ring*.018)-ring*.23);
    float arc=min(travel,1.0-travel);
    float spark=exp(-arc*arc*490.0);
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
    gl_FragColor=vec4(v_color*.76,v_alpha*.46);
    return;
  }
  vec2 p=gl_PointCoord*2.-1.;
  float r2=dot(p,p);
  if(r2>1.0) discard;
  if(u_bloom > .5) {
    float glow=exp(-r2*5.4)*.32;
    gl_FragColor=vec4(v_color*glow, v_alpha*.36);
  } else {
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
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const focus = useRef(active);
  const targetYaw = useRef(yaw);
  const targetPitch = useRef(pitch);
  const toneRef = useRef(layerTone === 'violet' ? 2 : layerTone === 'cyan' ? 1 : 0);
  const repaint = useRef<() => void>(() => {});
  const story = useRef<{ active: boolean; started: number }>({ active: false, started: 0 });

  useEffect(() => {
    story.current.active = cinematicActive && !reduced;
    if (cinematicActive && sequenceNonce > 0) story.current.started = performance.now();
    repaint.current();
  }, [cinematicActive, sequenceNonce, reduced]);

  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    focus.current = active;
    repaint.current();
  }, [active]);

  useEffect(() => {
    targetYaw.current = yaw;
    targetPitch.current = pitch;
    toneRef.current = layerTone === 'violet' ? 2 : layerTone === 'cyan' ? 1 : 0;
    repaint.current();
  }, [yaw, pitch, layerTone]);

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
  }, [paused, reduced, unavailable, nodeVecs, active]);
  if (unavailable) return <>{fallback}</>;
  return <canvas ref={ref} className="nexus-core-canvas nexus-webgl-core" data-renderer="webgl" aria-hidden="true" />;
};

export default WebGLNexusCore;
