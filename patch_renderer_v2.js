
const fs = require('fs');
const path = 'javascripts/rendering/Renderer.js';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Remove the accidental duplicate comment if it exists
    const duplicateComment = "// Explosion Animation (Reassembling IN - with Easing & Ghost Transition)\r\n        // Explosion Animation (Reassembling IN - with Easing & Ghost Transition)";
    if (content.includes(duplicateComment)) {
        content = content.replace(duplicateComment, "// Explosion Animation (Reassembling IN - with Easing & Ghost Transition)");
    }

    // Identify the block to replace. We can match the start of the if block specifically.
    // We look for: if (this.isReassembling) {
    const startMarker = "if (this.isReassembling) {";
    const startIdx = content.indexOf(startMarker);

    if (startIdx !== -1) {
        // Find closing brace of this block
        let balance = 0;
        let endIdx = -1;

        for (let i = startIdx; i < content.length; i++) {
            if (content[i] === '{') balance++;
            else if (content[i] === '}') {
                balance--;
                if (balance === 0) {
                    endIdx = i + 1;
                    break;
                }
            }
        }

        if (endIdx !== -1) {
            const newBlock = `if (this.isReassembling) {
            this.reassemblyProgress += dt / this.reassemblyDuration;
            if (this.reassemblyProgress > 1.0) this.reassemblyProgress = 1.0;

            const t = this.reassemblyProgress;
            
            // Ease-In-Out Quadratic
            let easeFactor;
            if (t < 0.5) {
                easeFactor = 2 * t * t;
            } else {
                easeFactor = 1 - Math.pow(-2 * t + 2, 2) / 2;
            }
            
            const maxExplosionTime = 90;
            const currentSimulationTime = maxExplosionTime * (1 - easeFactor);
            
            // Synchronize visuals
            const targetFogDensity = 0.001; 
            const currentDensity = 0.0 + (targetFogDensity * easeFactor);
            this.scene.fog = new THREE.FogExp2(0x1a1a1a, currentDensity);
            
            const targetLightFactor = 0.85;
            const currentLightFactor = 1.0 - ((1.0 - targetLightFactor) * easeFactor);
            
            this.scene.traverse(obj => {
                if (obj.isLight && obj.userData.originalIntensity !== undefined) {
                    obj.intensity = obj.userData.originalIntensity * currentLightFactor;
                }
            });
            
            for (let i = 0; i < this.game.width * this.game.height; i++) {
                const x = i % this.game.width;
                const y = Math.floor(i / this.game.width);
                this.dummy.position.set(
                    (x - this.game.width / 2) * 22 + 10,
                    0,
                    (y - this.game.height / 2) * 22 + 10
                );
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.scale.set(0.9, 0.9, 0.9);

                const vec = this.explosionVectors[i];
                if (vec) {
                    this.dummy.rotation.x += 10 * vec.dx * currentSimulationTime;
                    this.dummy.rotation.y += 10 * vec.dy * currentSimulationTime;
                    this.dummy.position.x += 200 * vec.dx * currentSimulationTime;
                    this.dummy.position.y += 200 * vec.dy * currentSimulationTime;
                }
                
                this.dummy.updateMatrix();
                this.gridMesh.setMatrixAt(i, this.dummy.matrix);
            }
            this.gridMesh.instanceMatrix.needsUpdate = true;
        }`;

            // Replace
            const original = content.substring(startIdx, endIdx);
            content = content.replace(original, newBlock);
            fs.writeFileSync(path, content, 'utf8');
            console.log('Renderer.js patched with EaseInOutQuad successfully.');
        } else {
            console.error('Could not find end of isReassembling block.');
        }
    } else {
        console.error('Could not find isReassembling block to patch.');
    }

} catch (err) {
    console.error(err);
}
