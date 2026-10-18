import * as THREE from 'three';

/** 同一中心喷口的体积气流；噪声随时间向下流动，边缘和末端消散。 */
export function createDroneExhaust() {
  const geometry = new THREE.BoxGeometry(1.7, 2.8, 1.7);
  geometry.translate(0, -1.4, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    uniforms: { time: { value: 0 }, power: { value: 0 } },
    vertexShader: `varying vec3 rayStart; varying vec3 rayEnd;
      void main(){
        rayStart=(inverse(modelMatrix)*vec4(cameraPosition,1.0)).xyz;
        rayEnd=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader: `varying vec3 rayStart; varying vec3 rayEnd;
      uniform float time; uniform float power;
      float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float noise(vec3 p){
        vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
          mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
          mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main(){
        vec3 rd=normalize(rayEnd-rayStart);
        vec3 t0=(vec3(-.85,-2.8,-.85)-rayStart)/rd;
        vec3 t1=(vec3(.85,0.,.85)-rayStart)/rd;
        vec3 nearV=min(t0,t1),farV=max(t0,t1);
        float a=max(0.,max(nearV.x,max(nearV.y,nearV.z)));
        float b=min(farV.x,min(farV.y,farV.z));
        if(b<=a) discard;
        float stepSize=(b-a)/28.;
        vec4 sum=vec4(0.);
        for(int i=0;i<28;i++){
          vec3 p=rayStart+rd*(a+(float(i)+.5)*stepSize);
          float t=clamp(-p.y/2.8,0.,1.);
          vec2 swirl=vec2(sin(t*11.-time*4.),cos(t*9.+time*3.))*.09*t;
          float width=.15+.52*pow(t,.8);
          float edge=1.-smoothstep(width*.35,width,length(p.xz+swirl));
          float n=noise(p*6.+vec3(0,time*3.,0))*.7+noise(p*14.+vec3(time,time*5.,0))*.3;
          float density=edge*pow(1.-t,1.2)*smoothstep(.15,.78,n)*power;
          float alpha=1.-exp(-density*stepSize*10.);
          vec3 color=mix(vec3(.08,.42,1.),vec3(.76,.96,1.),pow(1.-t,5.));
          sum.rgb+=(1.-sum.a)*alpha*color;
          sum.a+=(1.-sum.a)*alpha;
        }
        if(sum.a<.008) discard;
        gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
      }`,
  });
  const root = new THREE.Mesh(geometry, material);
  root.frustumCulled = false;
  return {
    root,
    update(time: number, thrust: number): void {
      root.visible = thrust > 0.015;
      root.scale.y = 0.35 + thrust * 0.65;
      material.uniforms.time!.value = time;
      material.uniforms.power!.value = thrust;
    },
    dispose(): void { geometry.dispose(); material.dispose(); },
  };
}

export function createDroneEnergy() {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x39e1ff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  material.color.multiplyScalar(2.3);
  const geometry = new THREE.TorusGeometry(1, 0.022, 6, 64);
  const rings = [0.22, 0.40, 0.58].map((radius, i) => {
    const ring = new THREE.Mesh(geometry, material);
    ring.scale.setScalar(radius);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = i * 0.055;
    root.add(ring);
    return ring;
  });
  const coreGeometry = new THREE.SphereGeometry(0.115, 12, 8);
  const core = new THREE.Mesh(coreGeometry, material);
  core.scale.set(1, 1.5, 1);
  root.add(core);
  const moteGeometry = new THREE.SphereGeometry(0.018, 6, 4);
  const motes = new THREE.InstancedMesh(moteGeometry, material, 12);
  const matrix = new THREE.Matrix4();
  root.add(motes);
  return {
    root,
    update(time: number, flight: number): void {
      rings.forEach((ring, i) => {
        ring.rotation.set(Math.PI / 2 + Math.sin(time * 1.4 + i) * 0.18, Math.cos(time + i) * 0.15, time * (i % 2 ? -0.8 : 0.6));
        ring.position.y = i * 0.055 + Math.sin(time * 2 + i) * 0.025;
      });
      core.scale.y = 1.5 + Math.sin(time * 3) * 0.25 + flight * 0.4;
      for (let i = 0; i < 12; i++) {
        const a = time * (0.7 + i % 3 * 0.2) + i * Math.PI / 6;
        const r = 0.32 + (i % 3) * 0.12;
        matrix.makeTranslation(Math.cos(a) * r, 0.11 + Math.sin(a * 2 + i) * 0.10, Math.sin(a) * r);
        motes.setMatrixAt(i, matrix);
      }
      motes.instanceMatrix.needsUpdate = true;
    },
    dispose(): void { geometry.dispose(); coreGeometry.dispose(); moteGeometry.dispose(); material.dispose(); },
  };
}
