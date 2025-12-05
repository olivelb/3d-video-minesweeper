var affichage = {};
if (!Detector.webgl)
    Detector.addGetWebGLMessage();
var container;
var camera, scene, projector, renderer;
var numbers = [];
var intersects = [];
var selected;
var objects = [];
var texnum = [];
var xgrid = demine.TH;
var ygrid = demine.TV;
//var mouseXPercent,mouseYPercent;
var controls;
var text_gagné = "YOU WIN",
    height = 20,
    size = 70,
    hover = 30,
    curveSegments = 4,
    bevelThickness = 2,
    bevelSize = 1.5,
    bevelSegments = 3,
    bevelEnabled = true,
    font = "optimer", // helvetiker, optimer, gentilis, droid sans, droid serif
    weight = "bold", // normal bold
    style = "normal"; // normal italic
var text_perdu = "YOU LOST",
    height = 20,
    size = 70,
    hover = 30,
    curveSegments = 4,
    bevelThickness = 2,
    bevelSize = 1.5,
    bevelSegments = 3,
    bevelEnabled = true,
    font = "optimer", // helvetiker, optimer, gentilis, droid sans, droid serif
    weight = "bold", // normal bold
    style = "normal"; // normal italic
var meshs;
var flag = 0;
var particleGroup;
var particleGroup2 = [];
var particleGroups = [];
var emitter;
var emitter2 = [];
var meshes = [];
var materials = [];
lost = false;
gagné = false;
var present = [];
var devoile = [];
var particlevue = [];

// var cubemat;
var clock;
nb = 0;

affichage.init = function () {
    video = document.getElementById('image');
    clock = new THREE.Clock();
    container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, demine.TH * 20, demine.TV * 20);
    controls = new THREE.OrbitControls(camera);
    //controls.addEventListener('change', render);
    scene = new THREE.Scene();

    // var light = new THREE.DirectionalLight( 0xffffff );
    // light.position.set( 0.5, 1, 1 ).normalize();
    // scene.add( light );

    renderer = new THREE.WebGLRenderer(antialiasing = true);
    renderer.setClearColor(0x1f1f1f);

    renderer.setSize(window.innerWidth, window.innerHeight);

    container.appendChild(renderer.domElement);

    texture = new THREE.Texture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBFormat;
    texture.generateMipmaps = true;


    var i, j, ux, uy, ox, oy, xsize, ysize, geometry;
    ux = 1 / xgrid;
    uy = 1 / ygrid;
    xsize = demine.TH * 20 / xgrid;
    ysize = demine.TV * 20 / ygrid;
    var parameters = { color: 0xffffff, map: texture };


    //renderer.initMaterial( material_base, scene.__lights, scene.fog );
    for (var i = 0; i < demine.TH; i++) {
        present[i] = [];
        devoile[i] = [];
        for (var j = 0; j < demine.TV; j++) {
            geometry = new THREE.BoxGeometry(20, 20, 20);
            materials[0] = new THREE.MeshBasicMaterial({ color: 0x000000 });
            materials[1] = new THREE.MeshBasicMaterial({ color: 0x000000 });
            materials[2] = new THREE.MeshBasicMaterial({ color: 0x000000 });
            materials[3] = new THREE.MeshBasicMaterial({ color: 0x000000 });
            materials[5] = new THREE.MeshBasicMaterial({ color: 0x000000 });
            materials[4] = new THREE.MeshBasicMaterial(parameters);
            var cubemat = new THREE.MeshFaceMaterial(materials);
            ox = i;
            oy = j;
            change_uvs(geometry, ux, uy, ox, oy);
            var object = new THREE.Mesh(geometry, cubemat);


            // material.hue = Math.random();
            //  material.saturation = Math.random();

            // material.color.setHSL( material.hue, material.saturation, 0.5 );
            //  for ( var k = 2; k < geometry.faces.length; k ++ ) {
            //   geometry.faces[k].color.setHex(0xffffff );
            //  }

            object.position.x = -(demine.TH + 2) * 10 + i * 22;
            object.position.y = 0;
            object.position.z = (demine.TV + 2) * 10 - j * 22;
            object.rotation.x = -Math.PI / 2;
            object.x = i;
            object.y = j;
            scene.add(object);
            object.dx = 0.05 * (0.5 - Math.random());
            object.dy = 0.05 * (0.5 - Math.random());
            //object.needsUpdate=false;
            objects[j * demine.TH + i] = object;
            present[i][j] = true;
            devoile[i][j] = false;

        }
    }


    for (var i = 1; i < 9; i++) {
        texnum[i] = THREE.ImageUtils.loadTexture("images/j" + i + ".png"); // chargement des textures des canvas pour les nombres de bombes
    }
    //   numbers.push(number);

    projector = new THREE.Projector();
    container.appendChild(renderer.domElement);
    document.addEventListener('mousedown', onDocumentMouseDown, false);
    window.addEventListener('resize', onWindowResize, false);
    initfeuxfin();
}
    ;


function initParticles(posx, posz, pop) {
    particleGroup = new SPE.Group({
        texture: THREE.ImageUtils.loadTexture("images/star.png"),
        maxAge: 0.1
    });

    emitter = new SPE.Emitter({
        type: 'sphere',
        position: new THREE.Vector3(posx, 20, posz),
        radius: 10,
        radiusScale: new THREE.Vector3(1, 1, 1),
        speed: 50,
        colorStart: new THREE.Color('yellow'),
        colorStartSpread: new THREE.Vector3(20, 20, 20),
        colorEnd: new THREE.Color('red'),
        sizeStart: 10,
        sizeEnd: 0,
        opacityStart: 1,
        opacityMiddle: 0.5,
        opacityEnd: 0,
        particleCount: 1000,
        angleAlignVelocity: 1,
        alive: 1
    });

    particleGroup.addEmitter(emitter);
    particleGroups[pop] = particleGroup;
    scene.add(particleGroups[pop].mesh);
    particlevue[pop] = true;
    flag++;

}
function createText(text) {
    material = new THREE.MeshFaceMaterial([
        new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff }), // front
        new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff }) // side
    ]);
    group = new THREE.Object3D();
    textGeo = new THREE.TextGeometry(text, {
        size: size,
        height: height,
        curveSegments: curveSegments,
        font: font,
        weight: weight,
        style: style,
        bevelThickness: bevelThickness,
        bevelSize: bevelSize,
        bevelEnabled: bevelEnabled,
        material: 0,
        extrudeMaterial: 1

    });

    textGeo.computeBoundingBox();
    textGeo.computeVertexNormals();

    // "fix" side normals by removing z-component of normals for side faces
    // (this doesn't work well for beveled geometry as then we lose nice curvature around z-axis)

    if (!bevelEnabled) {

        var triangleAreaHeuristics = 0.1 * (height * size);

        for (var i = 0; i < textGeo.faces.length; i++) {

            var face = textGeo.faces[i];

            if (face.materialIndex === 1) {

                for (var j = 0; j < face.vertexNormals.length; j++) {

                    face.vertexNormals[j].z = 0;
                    face.vertexNormals[j].normalize();

                }

                var va = textGeo.vertices[face.a];
                var vb = textGeo.vertices[face.b];
                var vc = textGeo.vertices[face.c];

                var s = THREE.GeometryUtils.triangleArea(va, vb, vc);

                if (s > triangleAreaHeuristics) {

                    for (var j = 0; j < face.vertexNormals.length; j++) {

                        face.vertexNormals[j].copy(face.normal);

                    }

                }

            }

        }

    }

    var centerOffset = -0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x);

    textMesh1 = new THREE.Mesh(textGeo, material);

    textMesh1.position.x = centerOffset;
    textMesh1.position.y = hover;
    textMesh1.position.z = 0;

    textMesh1.rotation.x = 0;
    textMesh1.rotation.y = Math.PI * 2;

    group.add(textMesh1);
    group.position.y = 50;
    scene.add(group);
    initSmoke();

}

function initSmoke() {
    var texture = THREE.ImageUtils.loadTexture("images/flare.png");
    // texture.magFilter = THREE.LinearMipMapLinearFilter;
    // texture.minFilter = THREE.LinearMipMapLinearFilter;

    particleGroup3 = new SPE.Group({
        texture: texture,
        maxAge: 30
    });

    emitter2 = new SPE.Emitter({
        position: new THREE.Vector3(0, 0, 50),
        positionSpread: new THREE.Vector3(1500, 1500, 1500),
        colorStart: new THREE.Color('black'),
        colorStartSpread: new THREE.Vector3(1, 1, 1),
        colorEnd: new THREE.Color('black'),
        sizeStart: 150,
        sizeSpread: 20,
        opacityStart: 1,
        opacityMiddle: 1,
        opacityEnd: 1,
        particleCount: 2000,
    });

    particleGroup3.addEmitter(emitter2);
    scene.add(particleGroup3.mesh);
}

function initfeuxfin() {
    for (n_of_sources = 0; n_of_sources < 20; n_of_sources++) { // nombres d'emetteurs de particules avec GAGNE .... laissons al haazrad
        particleGroup2[n_of_sources] = new SPE.Group({// faire ...
            texture: THREE.ImageUtils.loadTexture("images/flare.png"),
            maxAge: Math.random() * 10
        });

        emitter2[n_of_sources] = new SPE.Emitter({
            type: 'sphere',
            position: new THREE.Vector3(Math.random() * 100, Math.random() * 100, Math.random() * 100),
            radius: Math.random() * 100,
            radiusScale: new THREE.Vector3(Math.random() * 5, Math.random() * 30 + 20, Math.random()) * 5,
            speed: 200,
            colorStart: new THREE.Color('blue'),
            colorStartSpread: new THREE.Vector3(Math.random() * 200, Math.random() * 200, Math.random() * 200),
            colorEnd: new THREE.Color('red'),
            colorEndSpread: new THREE.Vector3(Math.random() * 200, Math.random() * 200, Math.random() * 200),
            sizeStart: Math.random() * 4 + 1,
            sizeEnd: Math.random() * 100 + 50,
            opacityStart: 1,
            opacityMiddle: 0.75,
            opacityEnd: 0,
            particleCount: 3000,
            angleAlignVelocity: Math.random(),
            alive: Math.random()
        });

        particleGroup2[n_of_sources].addEmitter(emitter2[n_of_sources]);

    }
}

function feuxfin() {
    for (var k = 0; k < objects.length; k++) {
        scene.remove(objects[k]);
        objects[k].geometry.dispose();
    }
    for (var k = 0; k < meshes.length; k++) {
        scene.remove(meshes[k]);
        meshes[k].geometry.dispose();
    }
    for (var k = 0; k < particleGroups.length; k++) {
        particleGroups[k] !== undefined && scene.remove(particleGroups[k].mesh);
        particleGroups[k] !== undefined && particleGroups[k].geometry.dispose();
    }
    for (var i = 0; i < 20; i++) {
        scene.add(particleGroup2[i].mesh);
    }
    ;
}


function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}


function change_uvs(geometry, unitx, unity, offsetx, offsety) {

    var i, j, uv;

    for (i = 0; i < geometry.faceVertexUvs[0].length; i++) {

        uv = geometry.faceVertexUvs[0][i];

        for (j = 0; j < uv.length; j++) {

            uv[j].x = (uv[j].x + offsetx) * unitx;
            uv[j].y = (uv[j].y + offsety) * unity;

        }

    }

}

function onDocumentMouseDown(event) {

    //event.preventDefault();

    var vector = new THREE.Vector3((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1, 0.5);
    projector.unprojectVector(vector, camera);

    var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());

    intersects = raycaster.intersectObjects(objects);
    // console.log(objects);
    if (intersects[0] !== undefined && gagné === false) {
        selected = intersects[0].object;
        tox = selected.x; //this object x 
        toy = selected.y;  // this object y
        pos = Number(selected.id);
        // console.log(Number(selected.id));

        if (intersects.length > 0 && present[tox][toy] === true) {
            if (event.button === 0) {
                if (lost === true || (demine.nbMines[tox][toy] === true)) {
                    for (var k = 0; k < meshes.length; k++) {
                        scene.remove(meshes[k]);
                        meshes[k].geometry.dispose();
                    }
                    for (var k = 0; k < particleGroups.length; k++) {
                        particleGroups[k] !== undefined && scene.remove(particleGroups[k].mesh);
                        particleGroups[k] !== undefined && particleGroups[k].geometry.dispose();
                    }
                    perdu();
                }
                else {
                    demine.testcase(tox, toy);
                    for (var j = 0; j < objects.length; j++) {
                        objecty = objects[j].y;
                        objectx = objects[j].x;
                        particules = Number(objects[j].id);
                        // console.log(objectx,objecty);
                        if (demine.cNombre[objectx][objecty] === 0) {
                            scene.remove(objects[j]);
                            eraseParticles(particules);
                            // console.log("particleGroup: ", particleGroups[j]);                       
                            objects[j].geometry.dispose();
                            present[objectx][objecty] = false;
                            // objects[j].material.blending=2;
                            // objects[j].material.color.setHex(0xa0a0a0 );
                            //  objects[j].material.depthTest =true;
                            // objects[j].material.depthWrite = false;
                        }
                    }
                    if (demine.nbBombes[tox][toy] === 0) {
                        for (var i = 0; i < demine.TH; i++) {
                            for (var j = 0; j < demine.TV; j++) {
                                if (demine.cNombre[i][j] > 0 && devoile[i][j] === false) {
                                    objpos = j * demine.TH + i;
                                    // console.log("obj pos:" + objpos);
                                    var b = demine.nbBombes[i][j];
                                    var texture = texnum[b];
                                    var Material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, color: 0xffffff, blending: 2 });
                                    meshs = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), Material);
                                    //mesh.material.color.setHex(0xaaaaaa);

                                    meshs.position.x = objects[objpos].position.x;
                                    meshs.position.z = objects[objpos].position.z;
                                    meshs.position.y = 20;
                                    // mesh.scale.x = 1;
                                    //  mesh.scale.y = 1;
                                    scene.add(meshs);
                                    meshes.push(meshs);
                                    devoile[i][j] = true;
                                    eraseParticles(objects[objpos].id);

                                }


                            }
                        }
                    }
                    else if (devoile[tox][toy] === false) {
                        var b = demine.nbBombes[tox][toy];
                        var texture = texnum[b];
                        var Material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, color: 0xffffff, blending: 2 });
                        meshs = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), Material);
                        meshs.position.x = selected.position.x;
                        meshs.position.z = selected.position.z;
                        meshs.position.y = 20;
                        // mesh.scale.x = 0.4;
                        //  mesh.scale.y = 0.4;
                        scene.add(meshs);
                        meshes.push(meshs);
                        devoile[tox][toy] = true;
                        eraseParticles(pos);
                    }

                }
            }
            else if ((event.button === 2) && !devoile[tox][toy]) {
                // console.log("particlegroup:", particlevue[pos]);
                if ((particleGroups[pos] === undefined) || (particlevue[pos] === false)) {
                    initParticles(selected.position.x, selected.position.z, pos);

                }
                else if (particlevue[pos] === true) {
                    eraseParticles(pos);
                }
                if (flag === demine.bombes) {
                    gagné = testgagné();
                }
                ;

                // console.log(flag+" ,"+gagné + " ,"+particlevue[pos]+ " ," + nb);
            }
        }
    }
    // console.log(tox + " ," + toy + " ," + pos);
}

function eraseParticles(pos) {
    particleGroups[pos] !== undefined && scene.remove(particleGroups[pos].mesh);
    particleGroups[pos] !== undefined && particleGroups[pos].geometry.dispose();
    if (particlevue[pos] === true) {
        particlevue[pos] = false;
        if (flag > 0) {
            flag--;
        }
        ;
    }

}


function testgagné() {
    nb = 0;
    for (i = 0; i < demine.TH; i++) {
        for (j = 0; j < demine.TV; j++) {
            p = objects[j * demine.TH + i].id;
            particleGroups[p] !== undefined && demine.nbMines[i][j] && particlevue[p] && nb++;
        }
    }
    ;
    if (nb === demine.bombes) {
        return true;
    }
    else return false;
}


function perdu() {
    if (lost === false) {
        createText(text_perdu);
        lost = true;
    }
}
function gagne() {
    createText(text_gagné);
    feuxfin();

}


function explosion() {

    for (i = 0; i < objects.length; i++) {

        object = objects[i];

        object.rotation.x += 10 * object.dx;
        object.rotation.y += 10 * object.dy;
        // object.rotation.z += 15 * object.dx;

        object.position.x += 200 * object.dx;
        object.position.y += 200 * object.dy;
        // object.position.z += 200 * object.dx;

    }

}
var counter = 0;
affichage.animate = function () {

    requestAnimationFrame(affichage.animate);
    texture.needsUpdate = true;

    camera.lookAt(scene.position);
    controls.update();
    if (meshes !== undefined) {
        for (var i = 0; i < meshes.length; i++) {
            meshes[i].lookAt(camera.position);
            // meshes[i].needsUpdate=true;
        }
    }

    if ((lost === true) && (counter < 500)) {
        counter++;
        //console.log(counter);
        explosion();
        group.rotation.y += 0.01;
        (counter === 500) && location.reload();
        // meshperdu.lookAt(camera.position);
        // meshperdu.needsUpdate=true;
    }
    if ((gagné === true) && (counter < 2000)) {
        counter === 0 && gagne();
        counter++;
        group.rotation.y += 0.01;
        //group.lookAt(camera.position);
        (counter === 2000) && location.reload();

    }
    render(0.01);
}
function render(dt) {
    if (flag && (gagné === false)) {
        for (var q = 0; q < particleGroups.length; q++) {
            particleGroups[q] !== undefined && particleGroups[q].tick(dt);

        }
    }
    lost === true && particleGroup3.tick(dt);

    ;
    if (gagné === true) {
        for (var q2 = 0; q2 < 20; q2++) {
            particleGroup2[q2].tick(dt);

        }
    }
    ;

    //console.log(flag," ",gagné);
    renderer.render(scene, camera);
    // composer.render();
}
;

