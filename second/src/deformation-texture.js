import * as THREE from 'three';

export class DeformationTexture {
  constructor({
    size = 120,
    resolution = 512,
    depth = 0.15,
    stampRadius = 0.4,
    stampStrength = 0.4,
    canvas = null,
  } = {}) {
    this.size = size;
    this.resolution = resolution;
    this.depth = depth;
    this.stampRadius = stampRadius;
    this.stampStrength = stampStrength;
    this.origin = new THREE.Vector2(0, 0);

    this.canvas = canvas || document.createElement('canvas');
    this.canvas.width = resolution;
    this.canvas.height = resolution;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.materials = [];

    this.fillDefault();
  }

  fillDefault() {
    const v = Math.round(255);
    this.ctx.fillStyle = `rgb(${v},${v},${v})`;
    this.ctx.fillRect(0, 0, this.resolution, this.resolution);
    this.texture.needsUpdate = true;
  }

  updateOrigin(centerX, centerZ) {
    this.origin.set(centerX, centerZ);
  }

  worldToUV(x, z) {
    const half = this.size / 2;
    const u = (x - (this.origin.x - half)) / this.size;
    const v = (z - (this.origin.y - half)) / this.size;
    return { u, v };
  }

  stamp(worldX, worldZ) {
    const { u, v } = this.worldToUV(worldX, worldZ);
    const px = u * this.resolution;
    const py = v * this.resolution;
    const radius = (this.stampRadius / this.size) * this.resolution;

    const alpha = this.stampStrength;
    this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    this.ctx.beginPath();
    this._drawWrappedCircle(px, py, radius);
    this.ctx.fill();
    this.texture.needsUpdate = true;
  }

  _drawWrappedCircle(px, py, radius) {
    const res = this.resolution;
    const positions = [
      [px, py],
      [px + res, py],
      [px - res, py],
      [px, py + res],
      [px, py - res],
    ];
    for (const [x, y] of positions) {
      if (x + radius < 0 || x - radius > res || y + radius < 0 || y - radius > res) continue;
      this.ctx.moveTo(x + radius, y);
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }

  applyToMaterial(material) {
    this.materials.push(material);
    material.userData.deformApplied = true;
    material.needsUpdate = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.deformMap = { value: this.texture };
      shader.uniforms.deformOrigin = { value: new THREE.Vector2(this.origin.x, this.origin.y) };
      shader.uniforms.deformSize = { value: this.size };
      shader.uniforms.deformDepth = { value: this.depth };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n uniform sampler2D deformMap;\n uniform vec2 deformOrigin;\n uniform float deformSize;\n uniform float deformDepth;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n vec2 worldXZ = vec2(modelMatrix[3].x, modelMatrix[3].z) + position.xz;\n vec2 deformUV = (worldXZ - (deformOrigin - vec2(deformSize * 0.5))) / deformSize;\n deformUV = fract(deformUV);\n float deform = texture2D(deformMap, deformUV).r;\n transformed.y += deform * deformDepth;`,
      );

      material.userData.deformShader = shader;
    };
  }

  updateUniforms() {
    for (const mat of this.materials || []) {
      const shader = mat.userData?.deformShader;
      if (shader) {
        shader.uniforms.deformOrigin.value.set(this.origin.x, this.origin.y);
      }
    }
  }
}
