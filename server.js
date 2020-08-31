const http = require('http');
const express = require('express');

const app = require('express')();

app.use(express.static(__dirname));
app.get('/', (zah, odg) => odg.sendFile(__dirname + '/index.html'));
app.listen(10001, () => console.log('Slusa na 10001'));

const webSocketServer = require('websocket').server;

const httpServer = http.createServer();

httpServer.listen(10000, () => console.log('Slusa na portu 10000'));

//sve igre
const igre = {};
//svi klijenti
const klijenti = {};
//tajmer za potez 
let tajmer = null;

const wsServer = new webSocketServer({
    'httpServer': httpServer
});


wsServer.on('request', zahtev => {

    const veza = zahtev.accept(null, zahtev.origin);

    veza.on('message', poruka => {

        //poruka primljena
        const sadrzajPoruke = JSON.parse(poruka.utf8Data);

        if(sadrzajPoruke.metod === 'stariIgrac'){
            klijenti[sadrzajPoruke.stariID] = {
                'veza': klijenti[sadrzajPoruke.noviID].veza
            }
            //pre nego sto klijent moze da posalje id koji je vec imao, server ga je ubacio pod novim id
            delete klijenti[sadrzajPoruke.noviID];
            return;
        }

        //nova igra
        if(sadrzajPoruke.metod === 'novaIgra'){
            gotovPotez();
            //kreira id nove igre
            const idKlijenta = sadrzajPoruke.idKlijenta;
            const idIgre = guid();

            if(sadrzajPoruke.prethodnaIgra != undefined){
                napustiIgru(sadrzajPoruke.prethodnaIgra, idKlijenta);
            }

            igre[idIgre] = {
                'id': idIgre,
                'igraci': [{
                    'idKlijenta': idKlijenta,
                    'boja': 'red',
                    'aktivan': true
                }]
            }

            const odgovor = {
                'metod': 'novaIgra',
                'igra': igre[idIgre]
            }

            const v = klijenti[idKlijenta].veza;
            v.send(JSON.stringify(odgovor));
            return;
        }//nova igra

        if(sadrzajPoruke.metod === 'pridruzi'){
            const idKlijenta = sadrzajPoruke.idKlijenta;
            const idIgre = sadrzajPoruke.idIgre;
            const igra = igre[idIgre];

            if(igre[sadrzajPoruke.idIgre] == undefined){
                return;
            }
            
            if(igre[sadrzajPoruke.idIgre].igraci.length === 2){
                const odgovor = {
                    'metod': 'igraJePopunjena',
                    'idKlijenta': idKlijenta
                }
            
                veza.send(JSON.stringify(odgovor));
                return;
            }

            if(sadrzajPoruke.prethodnaIgra != undefined){
                napustiIgru(sadrzajPoruke.prethodnaIgra, idKlijenta);
            }     

            if(!igra){
                return;
            }

            //dodaje drugog igraca
            igra.igraci.push({
                'idKlijenta': idKlijenta,
                'boja': 'yellow',
                'aktivan': true
            });

            //stanje igre
            igra.tabla = [[], [], [], [], [], [], []];
            igra.igracNaRedu = 0;
            igra.brojPoteza = 0;

            const odgovor = {
                'metod': 'pridruzi',
                'igra': igra,
                'idIgre': idIgre
            }
            
            //obavestava oba igraca da se pridruzio
            igra.igraci.forEach( i => {
                klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor));
            });
            cekajPotez(igra);
            return;
        }//pridruzi

        if(sadrzajPoruke.metod === 'potez'){

            if(sadrzajPoruke.kolona < 0 || sadrzajPoruke.kolona > 6){
                const odgovor = {
                    'metod': 'nemogucPotez'
                }
                klijenti[sadrzajPoruke.idKlijenta].veza.send(JSON.stringify(odgovor));
                return;
            }

            const idIgre = sadrzajPoruke.idIgre;
            const igra = igre[idIgre];

            if(!igra) return;
            if(igra.igracNaRedu != sadrzajPoruke.brojIgraca || !(igra.igraci[0].aktivan && igra.igraci[1].aktivan)) return;

            //proverava da li je kolona popunjena 
            if(igra.tabla[sadrzajPoruke.kolona].length < 6){
                igra.tabla[sadrzajPoruke.kolona].push(sadrzajPoruke.brojIgraca);
            } else {
                const odgovor = {
                    'metod': 'nemogucPotez'
                }
                klijenti[sadrzajPoruke.idKlijenta].veza.send(JSON.stringify(odgovor));
                return;
            }

            //broji poteze do sada
            igra.brojPoteza = igra.brojPoteza + 1;

            //red sledeceg igraca
            igra.igracNaRedu = (igra.igracNaRedu+1)%2;
            gotovPotez();
            //ne proverava prvih 6 poteza jer ni jedan igrac nema dovoljno zetona
            if(igra.brojPoteza > 6){
                //proverava da li je igra gotova i ako jeste ko je pobedio
                const pobednik = proveriPobednika(igra);
                if(pobednik != null){
                    const odgovor2 = {
                        'metod': 'krajIgre',
                        'igra': igra,
                        'pobednik': pobednik,
                        'red': 5 - igra.tabla[sadrzajPoruke.kolona].length+1,
                        'kolona': sadrzajPoruke.kolona,
                        'boja': igra.igraci[sadrzajPoruke.brojIgraca].boja
                    }
        
                    igra.igraci.forEach( i => {
                        klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor2));
                    });
                    return;
                }
                 //proverava da li je tabla popunjena, a niko nije pobedio
                else if(igra.brojPoteza == 42){
                    const odgovor2 = {
                        'metod': 'krajIgre',
                        'igra': igra,
                        'pobednik': null,
                        'red': 5 - igra.tabla[sadrzajPoruke.kolona].length+1,
                        'kolona': sadrzajPoruke.kolona,
                        'boja': igra.igraci[sadrzajPoruke.brojIgraca].boja
                    }
        
                    igra.igraci.forEach( i => {
                        klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor2));
                    });
                    
                    return;
                }
            }

            const odgovor = {
                'metod': 'potez',
                'igra': igra,
                'red': 5 - igra.tabla[sadrzajPoruke.kolona].length+1,
                'kolona': sadrzajPoruke.kolona,
                'boja': igra.igraci[sadrzajPoruke.brojIgraca].boja
            }

            igra.igraci.forEach( i => {
                klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor));
            });
            cekajPotez(igra);
            return;
        }//potez

        
        //reset
        if(sadrzajPoruke.metod === 'reset'){
            
            const idIgre = sadrzajPoruke.idIgre;
            const igra =  igre[idIgre];
            cekajPotez(igra);
            if(igra == undefined) return;

            igra.tabla = [[], [], [], [], [], [], []];
            igra.igracNaRedu = 0;
            igra.brojPoteza = 0;

            const odgovor = {
                'metod': 'reset',
                'igra': igra
            }

            igra.igraci.forEach( i => {
                klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor));
            });
            return;

        }//reset

        //rejoin
        if(sadrzajPoruke.metod === 'rejoin'){
            
            const idKlijenta = sadrzajPoruke.idKlijenta;
            const idIgre = sadrzajPoruke.idIgre;
            let igrac = null;

            if(igre[idIgre] != undefined){
                cekajPotez(igre[idIgre]);
                let i = null;
                for(i = 0; i<igre[idIgre].igraci.length; i++){
                    if(igre[idIgre].igraci[i].idKlijenta == idKlijenta){
                        igre[idIgre].igraci[i].aktivan = true;
                        igrac = igre[idIgre].igraci[i];
                        break;
                    }
                        
                }

                const odgovor = {
                    'metod': 'rejoin',
                    'idIgre': idIgre,
                    'igra': igre[idIgre],
                    'igrac': igrac
                }
            
                klijenti[idKlijenta].veza.send(JSON.stringify(odgovor));

                const odgovor2 ={
                    'igra': igre[idIgre],
                    'metod': 'protivnikVratio'
                }

                klijenti[igre[idIgre].igraci[(i+1)%2].idKlijenta].veza.send(JSON.stringify(odgovor2));
                return;
            }
        }//rejoin

    });//poruka

    const idKlijenta = guid();
    klijenti[idKlijenta] = {
        'veza': veza,
    }

    const odgovor = {
        'metod': 'uspostaviVezu',
        'idKlijenta': idKlijenta
    }

    veza.send(JSON.stringify(odgovor));

    
    veza.on('close', function(c, id) {
        let k = null;
        //nalazi klijenta koji se izlogovao, tj. njegov id i upisuje ga u k
        for(k in klijenti){
            let prekinutaVeza = wsServer.connections.includes(klijenti[k].veza);//skup svih veza na serveru
            if(prekinutaVeza === false){
                //klijent koji nije u vezama a jeste u klijenti se izbacuje iz tog niza, jer je on upravo prekinuo vezu
                delete klijenti[k];
                break;
            }
        }
        //nalazi igru(igre) u kojoj je klijent k
        for(let i in igre){
            //ako je jedan od igraca i, napusta tu igru
            if(igre[i].igraci.length === 1){
                napustiIgru(i,k);
                break;
            }
            else if(igre[i].igraci[0].idKlijenta === k || igre[i].igraci[1].idKlijenta === k){
                napustiIgru(i,k);
                break;
            }   
        }

    });//on close

});//zahtev

//hash funkcija
function S4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1); 
}
 
const guid = () => (S4() + S4() + "-" + S4() + "-4" + S4().substr(0,3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase();
 
function proveriPobednika(igra) {
    
    let i = (igra.igracNaRedu+1)%2;

    for (let row = 0; row <=6; row++) {
        for (let col = 0; col <=2; col++) {
            if(igra.tabla[row][col] == null) break;
            if (igra.tabla[row][col] == i) {
                if ((igra.tabla[row][col+1] == i) && (igra.tabla[row][col+2] == i) && (igra.tabla[row][col+3] == i)) {
                    return i;//pobednik i
                }
            }
        }
    }
    for (let col = 0; col <=5; col++) {
        for (let row = 0; row <=3; row++) {
            if (igra.tabla[row][col] == i) {
                if ((igra.tabla[row+1][col] == i) && (igra.tabla[row+2][col] == i) && (igra.tabla[row+3][col] == i)) {
                    return i;
                }
            }
        }
    }
    for (let col = 0; col <=2; col++) {
        for (let row = 0; row <=3; row++) {
            if (igra.tabla[row][col] == i) {
                if ((igra.tabla[row+1][col+1] == i) && (igra.tabla[row+2][col+2] == i) && (igra.tabla[row+3][col+3] == i)) {
                    return i;
                }
            }
        }
    }
    for (let col = 0; col <=2; col++) {
        for (let row = 6; row >=3; row--) {
            if (igra.tabla[row][col] == i) {
                if ((igra.tabla[row-1][col+1] == i) && (igra.tabla[row-2][col+2] == i) && (igra.tabla[row-3][col+3] == i)) {
                    return i;
                }
            }
        }
    }
    
    return null;
}

function napustiIgru(idIgre, idNapustio){

    //proverava da li postoji igra koju napusta
    if(igre[idIgre] != undefined){
        //ako je jedini igrac u njoj napusta, igra se brise
        if(igre[idIgre].igraci.length === 1){
            delete igre[idIgre];
            return;
        }
        //ako su oba igraca u igri
        let indexNapustio = null;
        for(let ig = 0; ig < 2; ig++){
            if(igre[idIgre].igraci[ig].idKlijenta === idNapustio){
                indexNapustio = ig; //igrac igra.igraci[ig] je napustio igru
                break;
            }
        }
        //ako igrac koji nije napustio nije aktivan, ne salje mu se poruka i igra se samo brise
        if(igre[idIgre].igraci[Math.abs(indexNapustio-1)].aktivan === false){
            delete igre[idIgre];
            return;
        }
        //ako je drugi igrac i dalje aktivan u igri, salje mu se poruka da je njegov protivnik napustio igru
        //igra se ne brise
        igre[idIgre].igraci[indexNapustio].aktivan = false;
        const poruka = {
            'metod': 'igracNapustio'
        }
        //obavestava  igraca koji je jos tu da je njegov protivnik napustio igru
        if(klijenti[igre[idIgre].igraci[Math.abs(indexNapustio-1)].idKlijenta]!= undefined)
            klijenti[igre[idIgre].igraci[Math.abs(indexNapustio-1)].idKlijenta].veza.send(JSON.stringify(poruka));

    }
}

function cekajPotez(igra){
    tajmer = setTimeout(function(){istekloVreme50s(igra);},50000);
}

function gotovPotez(){
    clearTimeout(tajmer);
}

function istekloVreme50s(igra){
    if(igra == undefined) return;

    const odgovor = {
        'metod': 'istekloVreme',
        'igra': igra
    }

    igra.igraci.forEach( i => {
        klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor));
    });
    tajmer = setTimeout(function(){istekloVreme20s(igra);}, 20000);
    return;
}

function istekloVreme20s(igra){
    if(igra == undefined) return;

    const odgovor = {
        'metod': 'krajIgre',
        'igra': igra,
        'pobednik': (igra.igracNaRedu+1)%2
    }

    igra.igraci.forEach( i => {
        klijenti[i.idKlijenta].veza.send(JSON.stringify(odgovor));
    });
    return;
}