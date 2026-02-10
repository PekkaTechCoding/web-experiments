import * as THREE from 'three';

export class TrailSystem {
  constructor({
    size = 120,
    resolution = 512,
    stampRadius = 0.35,
    stampStrength = 0.6,
    canvas = null,
  } = {}) {
    this.size = size;
    this.resolution = resolution;
    this.stampRadius = stampRadius;
    this.stampStrength = stampStrength;
    this.origin = new THREE.Vector2(0, 0);

    this.canvas = canvas || document.createElement('canvas');
    this.canvas.width = resolution;
    this.canvas.height = resolution;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, resolution, resolution);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.materials = [];
  }

  worldToUV(x, z) {
    const half = this.size / 2;
    const u = (x - (this.origin.x - half)) / this.size;
    const v = (z - (this.origin.y - half)) / this.size;
    return { u, v };
  }

  updateOrigin(centerX, centerZ) {
    this.origin.set(centerX, centerZ);
  }

  clear() {
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.resolution, this.resolution);
    this.texture.needsUpdate = true;
  }

  stamp(worldX, worldZ) {
    const { u, v } = this.worldToUV(worldX, worldZ);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;

    const px = u * this.resolution;
    const py = (1 - v) * this.resolution;
    const radius = (this.stampRadius / this.size) * this.resolution;

    const grad = this.ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, `rgba(255,255,255,${this.stampStrength})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(px, py, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.texture.needsUpdate = true;
  }

  applyToMaterial(material) {
    this.materials.push(material);
    material.userData.trailApplied = true;
    material.needsUpdate = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.trailMap = { value: this.texture };
      shader.uniforms.trailOrigin = { value: new THREE.Vector2(this.origin.x, this.origin.y) };
      shader.uniforms.trailSize = { value: this.size };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n varying vec3 vWorldPos;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n vWorldPos = worldPosition.xyz;`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\n uniform sampler2D trailMap;\n uniform vec2 trailOrigin;\n uniform float trailSize;\n varying vec3 vWorldPos;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n vec2 trailUV = (vWorldPos.xz - (trailOrigin - vec2(trailSize * 0.5))) / trailSize;\n float trail = texture2D(trailMap, trailUV).r;\n diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35, trail);`,
      );

      material.userData.trailShader = shader;
    };
  }

  updateUniforms() {
    for (const mat of this.materials) {
      const shader = mat.userData?.trailShader;
      if (shader) {
        shader.uniforms.trailOrigin.value.set(this.origin.x, this.origin.y);
      }
    }
  }
}
