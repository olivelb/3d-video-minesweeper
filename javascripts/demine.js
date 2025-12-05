var demine = {};
demine.somme = 0;
// NBM = 10;
// var cx = 5;
// var cy = 5;
demine.TV = 20;
demine.TH = 30;
demine.cNombre = [];
demine.nbMines = [];
demine.nbBombes = [];   
demine.bombes = 50;

demine.demarrage = function () {
    for (var i = 0; i < demine.TH; i++) { //initialisation à 0 du nombre de Bombes et de la visibilité.
        demine.nbBombes[i] = [];
        demine.nbMines[i] = [];
        demine.cNombre[i] = [];
        for (var j = 0; j < demine.TV; j++) {
            demine.nbBombes[i][j] = 0;
            demine.nbMines[i][j] = false;
            demine.cNombre[i][j] = -1;
        }
    }
    function getRandomInt(num) {
        return Math.floor(Math.random() * num);
    }


    function initial(nombreDeMines) {
        var mineX;
        var mineY;
        compteur = nombreDeMines;
        while (compteur > 0) {
            mineX = getRandomInt(demine.TH);
            mineY = getRandomInt(demine.TV);
            if (demine.nbBombes[mineX][mineY] === 0) {
                demine.nbBombes[mineX][mineY] = 1;
                demine.nbMines[mineX][mineY] = true;
                compteur--;
            }
            ;
        }
    }

    function nombreBombes() {

        for (var x = 0; x < demine.TH; x++) {
            for (var y = 0; y < demine.TV; y++) {
                if (demine.nbMines[x][y] === false) {
                    somme = 0;
                    if (x + 1 < demine.TH && demine.nbMines[x + 1][y] === true) somme += 1;
                    if (x - 1 >= 0 && demine.nbMines[x - 1][y] === true) somme += 1;
                    if (y + 1 < demine.TV && demine.nbMines[x][y + 1] === true)somme += 1;
                    if (y - 1 >= 0 && demine.nbMines[x][y - 1] === true)somme += 1;
                    if (x - 1 >= 0 && y - 1 >= 0 && demine.nbMines[x - 1][y - 1] === true)somme += 1;
                    if (x + 1 < demine.TH && y + 1 < demine.TV && demine.nbMines[x + 1][y + 1] === true)somme += 1;
                    if (x - 1 >= 0 && y + 1 < demine.TV && demine.nbMines[x - 1][y + 1] === true)somme += 1;
                    if (x + 1 < demine.TH && y - 1 >= 0 && demine.nbMines[x + 1][y - 1] === true)somme += 1;
                    demine.nbBombes[x][y] = somme;

                }
            }
        }
    }

    initial(demine.bombes);
    nombreBombes(); // précalcul du nbre de bombes à priximité d'une bombe ...
};

demine.testcase = function (x, y) {
    var sommeBombe;
    cases = false;
    sommeBombe = demine.nbBombes[x][y];
    if (demine.cNombre[x][y] === -1) {
        demine.cNombre[x][y] = sommeBombe; // éviter de recalculer les cases déjà vues ...
        cases = true;
    }

    if (cases && sommeBombe === 0) {
       (x - 1 >= 0) && demine.testcase(x - 1, y); // tests logiques pour la récursivité
       (x - 1 >= 0 && y - 1 >= 0) && demine.testcase(x - 1, y - 1);       
       (y - 1 >= 0) && demine.testcase(x, y - 1);    
       (x + 1 < demine.TH && y - 1 >= 0) && demine.testcase(x + 1, y - 1);     
       (x + 1 < demine.TH) && demine.testcase(x + 1, y);
       (x + 1 < demine.TH && y + 1 < demine.TV) && demine.testcase(x + 1, y + 1);       
       (y + 1 < demine.TV) && demine.testcase(x, y + 1);
       (x - 1 >= 0 && y + 1 < demine.TV) && demine.testcase(x - 1, y + 1);    
    }
};

