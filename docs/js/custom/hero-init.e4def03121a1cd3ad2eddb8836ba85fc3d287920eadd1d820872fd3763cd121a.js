(()=>{var Se={accent:[.2196,.7412,.9725],accentDeep:[.0078,.5176,.7804]},Ue=Math.PI*2,qe=21,We=1.75,W=30,q=2.6,be=()=>({start(){},stop(){},setTheme(){},dispose(){}}),Ke=`#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,je=`attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,Je=`
uniform vec2 uRes;
uniform float uTime;
uniform float uTheme;
uniform float uMobile;
uniform float uOpacity;
uniform vec3 uAccent;
uniform vec3 uAccentDeep;
uniform vec2 uCubeCenter;
uniform float uCubePx;
uniform vec2 uLight;
uniform vec4 uEdges[12];
uniform float uEdgeShade[12];
uniform vec2 uFaceQuad[24];
uniform vec4 uFaceCol[6];
uniform vec4 uParticles[${W}];

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 p = uv * uRes;
  float aspect = uRes.x / max(uRes.y, 1.0);
  float lightTheme = step(0.5, uTheme);

  // \u80CC\u666F\uFF1A\u6DF1\u84DD\u9ED1 / \u51B7\u767D\u7AD6\u5411\u6E10\u53D8
  vec3 bgTop = mix(vec3(0.017, 0.024, 0.043), vec3(0.980, 0.990, 1.000), lightTheme);
  vec3 bgBot = mix(vec3(0.039, 0.071, 0.126), vec3(0.918, 0.951, 0.992), lightTheme);
  vec3 col = mix(bgTop, bgBot, pow(uv.y, mix(0.82, 0.62, lightTheme)));

  // \u53F3\u4FA7\u67D4\u5149\uFF0C\u7ED9\u7ACB\u65B9\u4F53\u4E00\u70B9\u73AF\u5883\u5149
  vec2 haloVec = (uv - vec2(0.67, 0.47)) * vec2(aspect, 1.0);
  float halo = exp(-dot(haloVec, haloVec) * 5.2);
  vec2 lowerHalo = (uv - vec2(0.58, 0.72)) * vec2(aspect, 1.0);
  float halo2 = exp(-dot(lowerHalo, lowerHalo) * 8.0);
  col += mix(uAccent * 0.085, uAccentDeep * 0.022, lightTheme) * halo;
  col += mix(uAccentDeep * 0.030, uAccentDeep * 0.010, lightTheme) * halo2;
  if (lightTheme > 0.5) {
    col = mix(col, vec3(0.965, 0.982, 1.0), halo * 0.38);
  }

  // \u5730\u9762\uFF1A\u4ECE\u5730\u5E73\u7EBF\u5411\u8FD1\u5904\u5C55\u5F00\u7684\u900F\u89C6\u7F51\u683C
  float horizon = uRes.y * mix(0.635, 0.675, uMobile);
  float vanishX = uRes.x * mix(0.555, 0.520, uMobile);
  float dy = p.y - horizon;
  float grid = 0.0;
  float gridHalo = 0.0;
  if (dy > 0.0) {
    float depth = uRes.y * 0.60 / max(dy, 0.001);
    float focal = uRes.y * 0.92;
    float worldX = (p.x - vanishX) * depth / focal;

    // \u6A2A\u5411\uFF08\u7B49\u6DF1\uFF09\u7EBF\uFF0C\u6CBF\u6DF1\u5EA6\u7F13\u6162\u6D41\u52A8
    float spacingZ = 0.40;
    float zPhase = depth / spacingZ + uTime * 0.060;
    float zFrac = fract(zPhase);
    float zDistPx = min(zFrac, 1.0 - zFrac) * (uRes.y * 0.60 * spacingZ / max(depth * depth, 0.01));
    float lineZ = 1.0 - smoothstep(0.0, 1.05, zDistPx);
    float glowZ = max(0.0, 1.0 - zDistPx / 9.0);
    glowZ *= glowZ;

    // \u7EB5\u5411\uFF08\u7B49 x\uFF09\u7EBF
    float spacingX = 0.48;
    float xPhase = worldX / spacingX;
    float xFrac = fract(xPhase);
    float xDistPx = min(xFrac, 1.0 - xFrac) * (focal * spacingX / max(depth, 0.01));
    float lineX = 1.0 - smoothstep(0.0, 1.0, xDistPx);
    float glowX = max(0.0, 1.0 - xDistPx / 8.0);
    glowX *= glowX;

    float fog = exp(-depth * 0.15);
    float nearFade = smoothstep(0.0, 26.0, dy);
    float leftQuiet = mix(0.28, 1.0, smoothstep(0.31, 0.68, uv.x));
    grid = (lineZ * 0.64 + lineX * 0.46) * fog * nearFade * leftQuiet;
    gridHalo = (glowZ * 0.19 + glowX * 0.11) * fog * nearFade * leftQuiet;
  }

  // \u7ACB\u65B9\u4F53\u5728\u5730\u9762\u4E0A\u7684\u5149\u6591/\u5012\u5F71
  vec2 poolCenter = vec2(uCubeCenter.x * uRes.x, uCubeCenter.y * uRes.y + uCubePx * 0.59);
  vec2 poolQ = (p - poolCenter) / vec2(uCubePx * 0.56, uCubePx * 0.115);
  float pool = exp(-dot(poolQ, poolQ) * 2.4);
  float poolStreak = exp(-pow((p.x - poolCenter.x) / (uCubePx * 0.18), 2.0))
                   * exp(-max(0.0, p.y - poolCenter.y) / (uCubePx * 0.17));
  poolStreak *= step(poolCenter.y - uCubePx * 0.035, p.y);

  if (lightTheme < 0.5) {
    vec3 gridCol = mix(uAccentDeep, uAccent, 0.58);
    col += gridCol * (grid * 0.28 + gridHalo * 0.38);
    col += uAccent * (pool * 0.110 + poolStreak * 0.058);
    float horizonGlow = exp(-abs(dy) / 30.0) * mix(0.22, 1.0, smoothstep(0.27, 0.62, uv.x));
    col += mix(uAccentDeep, uAccent, 0.6) * horizonGlow * 0.018;
  } else {
    col = mix(col, uAccentDeep, clamp(grid * 0.14 + gridHalo * 0.052, 0.0, 0.24));
    col = mix(col, vec3(0.60, 0.69, 0.80), clamp(pool * 0.105 + poolStreak * 0.070, 0.0, 0.22));
    float horizonGlow = exp(-abs(dy) / 30.0) * mix(0.22, 1.0, smoothstep(0.27, 0.62, uv.x));
    col = mix(col, uAccentDeep, clamp(horizonGlow * 0.020, 0.0, 0.05));
  }

  // \u5C18\u57C3\uFF1A\u666F\u6DF1\u5927\u5C0F\u4E0E\u4EAE\u5EA6\u5DEE\u5F02\uFF0C\u5DE6\u4FA7\u538B\u4F4E
  float leftQuietP = mix(0.18, 1.0, smoothstep(0.30, 0.58, uv.x));
  for (int i = 0; i < ${W}; i++) {
    vec4 pt = uParticles[i];
    if (pt.w < 0.002) continue;
    vec2 center = pt.xy * uRes;
    vec2 delta = p - center;
    if (max(abs(delta.x), abs(delta.y)) > pt.z * 4.2) continue;
    float d = length(delta);
    float core = 1.0 - smoothstep(pt.z * 0.35, pt.z * 1.55, d);
    float haze = max(0.0, 1.0 - d / max(pt.z * 3.0, 0.6));
    haze *= haze * 0.22;
    float twinkle = 0.72 + 0.28 * sin(uTime * 0.55 + float(i) * 2.13);
    float a = (core * 0.72 + haze) * pt.w * twinkle * leftQuietP;
    vec3 dustCol = mix(uAccent, vec3(0.86, 0.97, 1.0), 0.46);
    if (lightTheme < 0.5) col += dustCol * a * 0.75;
    else col = mix(col, uAccentDeep, clamp(a * 0.25, 0.0, 0.30));
  }

  // \u9762\uFF1A\u6BCF\u4E2A\u53EF\u89C1\u9762\u4E00\u4E2A\u6295\u5F71\u56DB\u8FB9\u5F62\uFF0C\u900F\u660E\u5EA6\u5F88\u4F4E
  for (int i = 0; i < 3; i++) {
    vec4 fc = uFaceCol[i];
    if (fc.a < 0.002) continue;
    vec2 A = uFaceQuad[i * 4 + 0] * uRes;
    vec2 B = uFaceQuad[i * 4 + 1] * uRes;
    vec2 C = uFaceQuad[i * 4 + 2] * uRes;
    vec2 D = uFaceQuad[i * 4 + 3] * uRes;
    float e0 = cross2(B - A, p - A);
    float e1 = cross2(C - B, p - B);
    float e2 = cross2(D - C, p - C);
    float e3 = cross2(A - D, p - D);
    bool inside = (e0 >= 0.0 && e1 >= 0.0 && e2 >= 0.0 && e3 >= 0.0)
               || (e0 <= 0.0 && e1 <= 0.0 && e2 <= 0.0 && e3 <= 0.0);
    if (inside) {
      float edgeD = min(min(abs(e0) / max(length(B - A), 0.001), abs(e1) / max(length(C - B), 0.001)),
                        min(abs(e2) / max(length(D - C), 0.001), abs(e3) / max(length(A - D), 0.001)));
      float cover = clamp(edgeD / 1.25, 0.0, 1.0);
      float gradY = clamp((p.y - uCubeCenter.y * uRes.y) / max(uCubePx, 1.0) + 0.5, 0.0, 1.0);
      float gradX = clamp((p.x - uCubeCenter.x * uRes.x) / max(uCubePx, 1.0) + 0.5, 0.0, 1.0);
      float sheen = 0.5 + 0.5 * dot(normalize(p - uCubeCenter * uRes + vec2(0.001)), normalize(uLight + vec2(0.0001)));
      float diag = (p.x - uCubeCenter.x * uRes.x) / max(uCubePx, 1.0)
                 + (p.y - uCubeCenter.y * uRes.y) / max(uCubePx, 1.0) * 0.52;
      float band = 1.0 - smoothstep(0.015, 0.20, abs(diag + 0.11));
      band *= band;
      vec3 faceCol = fc.rgb * (1.10 - 0.26 * gradY) * (0.95 + 0.10 * (1.0 - gradX)) * (0.94 + 0.08 * sheen);
      faceCol += uAccent * band * mix(0.034, 0.015, lightTheme);
      if (lightTheme < 0.5) {
        col = mix(col, faceCol, clamp(fc.a * cover * uOpacity, 0.0, 0.18));
      } else {
        col = mix(col, faceCol * 0.72, clamp(fc.a * cover * uOpacity * 0.92, 0.0, 0.16));
      }
    }
  }

  // \u68F1\uFF1A\u8DDD\u79BB\u573A\u5B9E\u73B0\u6838\u5FC3\u4EAE\u7EBF + \u5185\u5916\u67D4\u5149\uFF0C\u907F\u514D GL_LINES \u7EBF\u5BBD\u4E0D\u53EF\u63A7
  vec3 hot = mix(vec3(0.80, 0.96, 1.0), uAccentDeep * 0.85, lightTheme);
  vec3 cool = mix(uAccent, uAccentDeep * 0.92, lightTheme);
  for (int i = 0; i < 12; i++) {
    vec4 e = uEdges[i];
    vec2 a = e.xy * uRes;
    vec2 b = e.zw * uRes;
    if (p.x < min(a.x, b.x) - 14.0 || p.x > max(a.x, b.x) + 14.0 ||
        p.y < min(a.y, b.y) - 14.0 || p.y > max(a.y, b.y) + 14.0) continue;
    float d = sdLine(p, a, b);
    float core = 1.0 - smoothstep(0.0, 1.28, d);
    float inner = max(0.0, 1.0 - d / 5.5);
    inner *= inner;
    float outer = max(0.0, 1.0 - d / 13.0);
    outer *= outer * outer;
    float amount = (core * 0.88 + inner * 0.22 + outer * 0.065) * uEdgeShade[i] * uOpacity;
    vec3 edgeCol = mix(cool, hot, core * 0.72);
    if (lightTheme < 0.5) {
      col += edgeCol * amount;
    } else {
      float a = clamp(amount * mix(0.76, 1.0, core), 0.0, 0.92);
      col = mix(col, mix(uAccentDeep * 0.50, uAccentDeep * 0.88, core), a);
    }
  }

  // \u6697\u89D2 + \u9759\u6001\u6296\u52A8\uFF0C\u538B\u6389 8bit \u8272\u5E26
  vec2 vq = (uv - 0.5) * vec2(aspect * 0.72, 1.0);
  float vr = length(vq);
  float vig = 1.0 - smoothstep(0.18, 1.02, vr);
  if (lightTheme < 0.5) {
    col *= mix(0.70, 1.0, vig);
    col += (ign(gl_FragCoord.xy) - 0.5) * (0.9 / 255.0);
    col += (hash21(floor(p * 0.82)) - 0.5) * 0.0035;
  } else {
    col = mix(col, vec3(0.900, 0.933, 0.974), (1.0 - vig) * 0.18);
    col += (ign(gl_FragCoord.xy) - 0.5) * (0.55 / 255.0);
  }

  OUT_COLOR = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;function ke(t,c={}){if(!t||typeof window=="undefined")return be();let h=t.ownerDocument||document,m=re(c.accent,Se.accent),r=re(c.accentDeep,Se.accentDeep),x=c.theme==="light"?"light":"dark",d=!1,u=!1,e=null,s=null,v=null,V=-1,f=null,z=0,H=!1,w=!1,K=!0,j=!h.hidden,E=!1,J=0,L=0,ee=1,ae=1,le=1,_=!1,F=null,M=null,te=null,Ce=0,we=0,S=0,B=0,Ie=nt(),N=new Float32Array(48),Ae=new Float32Array(12),oe=new Float32Array(48),O=new Float32Array(24),Y=new Float32Array(W*4);try{e=t.getContext("webgl2",Be())||t.getContext("webgl",Be())}catch{e=null}if(!e||(E=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches),!Pe()))return Te();function se(){let o=t.parentElement,n=t.getBoundingClientRect(),i=o?o.getBoundingClientRect():n,b=n.width>1?n.width:i.width,p=n.height>1?n.height:i.height;ee=Math.max(1,Math.round(b)),ae=Math.max(1,Math.round(p)),le=Math.min(window.devicePixelRatio||1,We),_=ee<760;let R=Math.max(1,Math.round(ee*le)),k=Math.max(1,Math.round(ae*le));t.width!==R&&(t.width=R),t.height!==k&&(t.height=k)}function Pe(){try{let o=typeof WebGL2RenderingContext!="undefined"&&e instanceof WebGL2RenderingContext,n=Re(e.VERTEX_SHADER,o?Ke:je),i=o?"fragColor":"gl_FragColor",b=o?`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
`:`precision highp float;
varying vec2 vUv;
`,p=Re(e.FRAGMENT_SHADER,b+Je.replace(/OUT_COLOR/g,i));return n===null||p===null||(s=e.createProgram(),e.attachShader(s,n),e.attachShader(s,p),e.linkProgram(s),e.deleteShader(n),e.deleteShader(p),!e.getProgramParameter(s,e.LINK_STATUS))||(v=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),V=e.getAttribLocation(s,"aPos"),V<0)?!1:(f=Xe(s),e.useProgram(s),e.disable(e.DEPTH_TEST),e.disable(e.CULL_FACE),e.disable(e.BLEND),se(),!0)}catch{return!1}}function Re(o,n){try{let i=e.createShader(o);return e.shaderSource(i,n),e.compileShader(i),e.getShaderParameter(i,e.COMPILE_STATUS)?i:(e.deleteShader(i),null)}catch{return null}}function Xe(o){let n={},i=e.getProgramParameter(o,e.ACTIVE_UNIFORMS)||0;for(let b=0;b<i;b++){let p=e.getActiveUniform(o,b);if(!p)continue;let R=p.name.replace(/\[0\]$/,"");n[R]=e.getUniformLocation(o,p.name)}return n}function Te(){if(u)return be();u=!0,w=!1,P(),F&&F.disconnect(),M&&M.disconnect();try{t.style.display="none"}catch{}return be()}function Qe(){return _?.78:1}function U(o){if(!e||!s||u||d)return;let n=ee,i=ae;if(n<2||i<2)return;e.viewport(0,0,t.width,t.height),e.useProgram(s),e.bindBuffer(e.ARRAY_BUFFER,v),e.enableVertexAttribArray(V),e.vertexAttribPointer(V,2,e.FLOAT,!1,0,0),S+=(Ce-S)*.055,B+=(we-B)*.055;let b=-.12+o*(Ue/qe)+S*.052,p=.43+B*.048,R=Math.cos(b),k=Math.sin(b),fe=Math.cos(p),he=Math.sin(p),me=Math.min(i*.142,n*.235),de=n*(_?.58:.65)+S*(_?3:7),ze=i*(_?.7:.47)+B*(_?2:5)+Math.sin(o*.55)*i*.005,Le=[de/n,ze/i],ne=new Array(8),pe=1/0,ge=-1/0;for(let l=0;l<8;l++){let a=et[l],A=a[0]*R+a[2]*k,y=-a[0]*k+a[2]*R,C=a[1]*fe-y*he,g=a[1]*he+y*fe,G=5.7/(5.7-g*.9),Z=de+A*me*G,X=ze-C*me*G;ne[l]={x:Z/n,y:X/i,z:g},pe=Math.min(pe,X),ge=Math.max(ge,X)}let He=Math.max(20,ge-pe);for(let l=0;l<12;l++){let[a,A]=tt[l],y=ne[a],C=ne[A];N[l*4]=y.x,N[l*4+1]=y.y,N[l*4+2]=C.x,N[l*4+3]=C.y;let g=(y.z+C.z)*.5;Ae[l]=.38+.62*Q((g+1.05)/2.1)}let I=x==="light"?1:0,Ne=I?ce(r,m,.68):ce(m,[1,1,1],.48),Ye=I?ce(r,m,.4):m,Ge=ie(.14,.1,I),Ze=ie(.105,.072,I),$e=ie(.068,.047,I);oe.fill(0),O.fill(0);let T=0;for(let l=0;l<6&&T<3;l++){let a=ot[l],A=a.n,y=-A[0]*k+A[2]*R;if(A[1]*he+y*fe<=.012)continue;let g=0,G=0,Z=[];for(let D of a.v){let ve=ne[D];g+=ve.x,G+=ve.y,Z.push(ve)}g/=4,G/=4;let X=Q((g-de/n)/Math.max(.055,me*2.2/n)+.5),$,xe;a.kind==="top"?($=Ne,xe=Ge):($=ce(Ye,r,X*.82),xe=ie(Ze,$e,X)),O[T*4]=$[0],O[T*4+1]=$[1],O[T*4+2]=$[2],O[T*4+3]=xe;for(let D=0;D<4;D++)oe[T*8+D*2]=Z[D].x,oe[T*8+D*2+1]=Z[D].y;T++}for(let l=0;l<W;l++){let a=Ie[l],A=Math.sin(o*a.speed+a.phase)*a.drift*.011,y=Math.cos(o*a.speed*.72+a.phase*1.4)*a.drift*.009,C=a.x+A+S*.0025*a.depth,g=a.y+y+B*.0018*a.depth;C=(C%1+1)%1,g=(g%1+1)%1,Y[l*4]=C,Y[l*4+1]=g,Y[l*4+2]=a.size*(.72+a.depth*.78),Y[l*4+3]=a.alpha*(.5+a.depth*.62)}e.uniform2f(f.uRes,n,i),e.uniform1f(f.uTime,o),e.uniform1f(f.uTheme,I),e.uniform1f(f.uMobile,_?1:0),e.uniform1f(f.uOpacity,Qe()),e.uniform3fv(f.uAccent,m),e.uniform3fv(f.uAccentDeep,r),e.uniform2f(f.uCubeCenter,Le[0],Le[1]),e.uniform1f(f.uCubePx,He),e.uniform2f(f.uLight,S,-B),e.uniform4fv(f.uEdges,N),e.uniform1fv(f.uEdgeShade,Ae),e.uniform2fv(f.uFaceQuad,oe),e.uniform4fv(f.uFaceCol,O),e.uniform4fv(f.uParticles,Y),e.drawArrays(e.TRIANGLES,0,3)}function De(o){if(!(!H||d||u)){z=0;try{L||(L=o);let n=Math.min(.05,Math.max(0,(o-L)/1e3));L=o,J+=n,U(J)}catch{P();return}z=window.requestAnimationFrame(De)}}function P(){H=!1,L=0,z&&(window.cancelAnimationFrame(z),z=0)}function Ee(){if(!(H||d||u||!e||!s)){if(E){try{U(q)}catch{}return}!w||!K||!j||(H=!0,L=0,z=window.requestAnimationFrame(De))}}function ue(){d||u||(w&&K&&j&&!E?Ee():P())}function _e(o){try{o.preventDefault()}catch{}P(),s=null,v=null,f=null,V=-1}function Fe(){if(!(d||u))try{if(!Pe()){u=!0,w=!1,P(),t.style.display="none";return}E?U(q):w&&K&&j&&Ee()}catch{u=!0,w=!1,P();try{t.style.display="none"}catch{}}}function Me(o){try{let i=(t.parentElement||t).getBoundingClientRect();Ce=Oe((o.clientX-i.left)/Math.max(i.width,1)*2-1,-1,1),we=Oe((o.clientY-i.top)/Math.max(i.height,1)*2-1,-1,1)}catch{}}function Ve(){if(!(d||u))try{se(),H||U(E?q:J)}catch{}}try{t.addEventListener("webglcontextlost",_e,!1),t.addEventListener("webglcontextrestored",Fe,!1),window.addEventListener("pointermove",Me,{passive:!0}),window.ResizeObserver&&(M=new ResizeObserver(Ve),M.observe(t.parentElement||t)),window.IntersectionObserver&&(F=new IntersectionObserver(o=>{K=!!(o[0]&&o[0].isIntersecting),ue()},{threshold:.01}),F.observe(t)),te=()=>{j=!h.hidden,ue()},h.addEventListener("visibilitychange",te,!1)}catch{}try{se(),U(E?q:0)}catch{}return{start(){d||u||(w=!0,ue())},stop(){w=!1,P()},setTheme(o,n){if(!(d||u)){x=o==="light"?"light":"dark",n&&(m=re(n.accent,m),r=re(n.accentDeep,r));try{U(E?q:J)}catch{}}},dispose(){if(!d){d=!0,P(),w=!1,F&&F.disconnect(),M&&M.disconnect(),F=null,M=null;try{window.removeEventListener("pointermove",Me),te&&h.removeEventListener("visibilitychange",te),t.removeEventListener("webglcontextlost",_e),t.removeEventListener("webglcontextrestored",Fe)}catch{}try{e&&(v&&e.deleteBuffer(v),s&&e.deleteProgram(s))}catch{}v=null,s=null,f=null,e=null}}}}var et=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],tt=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],ot=[{v:[4,5,6,7],n:[0,0,1],kind:"side"},{v:[1,5,6,2],n:[1,0,0],kind:"side"},{v:[0,4,7,3],n:[-1,0,0],kind:"side"},{v:[0,1,2,3],n:[0,0,-1],kind:"side"},{v:[3,2,6,7],n:[0,1,0],kind:"top"},{v:[0,1,5,4],n:[0,-1,0],kind:"bottom"}];function Be(){return{alpha:!1,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!1,powerPreference:"high-performance"}}function re(t,c){return!t||typeof t.length!="number"||t.length<3?c.slice():[Q(Number(t[0])||0),Q(Number(t[1])||0),Q(Number(t[2])||0)]}function ce(t,c,h){let m=Q(h);return[t[0]+(c[0]-t[0])*m,t[1]+(c[1]-t[1])*m,t[2]+(c[2]-t[2])*m]}function Q(t){return t<0?0:t>1?1:t}function Oe(t,c,h){return t<c?c:t>h?h:t}function ie(t,c,h){return t+(c-t)*h}function nt(){let t=2654435769,c=()=>(t^=t<<13,t^=t>>>17,t^=t<<5,(t>>>0)/4294967296),h=[];for(let m=0;m<W;m++){let r=.2+c()*.8;h.push({x:.05+c()*.92,y:.06+c()*.82,depth:r,drift:.4+c()*1,speed:.12+c()*.36,phase:c()*Ue,size:.55+c()*1.35+r*.35,alpha:.16+c()*.44})}return h}var ye=document.getElementById("hero-bg");if(ye){let t=document.documentElement,c=(r,x)=>{let d=(r||"").trim();if(!d)return x;let u=d.match(/^#([0-9a-f]{3})$/i);if(u){let e=u[1];return[0,1,2].map(s=>parseInt(e[s]+e[s],16)/255)}if(u=d.match(/^#([0-9a-f]{6})$/i),u){let e=u[1];return[0,2,4].map(s=>parseInt(e.slice(s,s+2),16)/255)}return u=d.match(/^rgba?\(([^)]+)\)$/i),u?u[1].split(/[\s,\/]+/).filter(Boolean).slice(0,3).map(s=>{let v=parseFloat(s);return Number.isFinite(v)?Math.min(1,Math.max(0,v/255)):0}):x},h=()=>{let r=getComputedStyle(t);return{accent:c(r.getPropertyValue("--accent"),[.22,.741,.973]),accentDeep:c(r.getPropertyValue("--accent-deep"),[.008,.518,.78]),accentBright:c(r.getPropertyValue("--accent-bright"),[.49,.827,.988])}},m=()=>{let r=t.dataset.theme;return r==="dark"||r==="light"?r:window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"};try{let r=ke(ye,{theme:m(),...h()});r.start(),new MutationObserver(()=>{var x;(x=r.setTheme)==null||x.call(r,m(),h())}).observe(t,{attributes:!0,attributeFilter:["data-theme"]}),window.addEventListener("pagehide",()=>{var x;(x=r.dispose)==null||x.call(r)},{once:!0})}catch(r){ye.style.display="none",window.console&&console.warn&&console.warn("[hero] background disabled",r)}}})();
