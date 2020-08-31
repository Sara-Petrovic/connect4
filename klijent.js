const ws = new WebSocket("ws://localhost:10000");

let kolacici = null;

let id = null;
let brojIgraca = null;
let bojaIgraca = null;
let idIgre = null;
let timerId = null;
let timer = 7;


let btnNovaIgra = document.getElementById("btnNovaIgra");
let btnPridruzi = document.getElementById("btnPridruzi");
let inptIdIgre = document.getElementById("inptIdIgre");
let stanje = document.getElementById("stanje");
let bojaP = document.querySelector("#boja");

let btnReset = document.getElementById("btnReset");
let headingTimer = document.getElementById("timer");

let naPotezu = null;
let potez = null;
let igraGotova = false;

let polja = document.getElementsByClassName("polje");

btnNovaIgra.addEventListener("click", (e) => {
  let zahtev = {
    idKlijenta: id,
    metod: "novaIgra",
  };
  igraGotova = false;
  if (idIgre != null) {
    zahtev.prethodnaIgra = idIgre;
  }

  ws.send(JSON.stringify(zahtev));
}); 

btnPridruzi.addEventListener("click", (e) => {
  brojIgraca = null;

  let zahtev = {
    metod: "pridruzi",
    idKlijenta: id,
    idIgre: inptIdIgre.value.trim(),
  };

  igraGotova = false;

  if (idIgre != null) {
    zahtev.prethodnaIgra = idIgre;
  }

  ws.send(JSON.stringify(zahtev));
}); 

for (let i = 0; i < polja.length; i++) {
  polja[i].addEventListener("click", (e) => {
    if (idIgre && !igraGotova) {
      potez = i;
      let zahtev = {
        metod: "potez",
        idKlijenta: id,
        idIgre: idIgre,
        brojIgraca: brojIgraca,
        kolona: potez % 7,
      };

      ws.send(JSON.stringify(zahtev));
    }
  });
}

//igraci pocinju igru ispocetka
btnReset.addEventListener("click", (e) => {
  if (idIgre) {
    const zahtev = {
      metod: "reset",
      idIgre: idIgre,
    };

    ws.send(JSON.stringify(zahtev));
  }
});

//ucitava sve kolacice
ws.onopen = () => {
  kolacici = document.cookie
    .split(";")
    .map((kolacic) => kolacic.split("="))
    .reduce(
      (ak, [kljuc, vrednost]) => ({
        ...ak,
        [kljuc.trim()]: decodeURIComponent(vrednost),
      }),
      {}
    );
  console.log(kolacici);
};

//poruka od servera
ws.onmessage = (poruka) => {
  //podesava datum do kog ce kolacici trajati (1h)
  let dExpCookie = new Date();
  dExpCookie.setTime(dExpCookie.getTime() + 60 * 60 * 1000);

  //sadrzaj poruke
  const odgovor = JSON.parse(poruka.data);
  console.log(odgovor);

  //uspostavljenje veze
  if (odgovor.metod === "uspostaviVezu") {
    if (kolacici.c_id === undefined) {
      id = odgovor.idKlijenta;

      document.cookie = `c_id=${id};expires=${dExpCookie.toUTCString()}`;
      document.cookie = `g_id=${null};expires=${dExpCookie.toUTCString()}`;

      stanje.innerText = "Veza uspesno uspostavljena!";
      console.log("Veza uspesno uspostavljena, sa id: " + id);
      return;
    } else {
      id = kolacici.c_id;


      let zahtev = {
        metod: "stariIgrac",
        noviID: odgovor.idKlijenta,
        stariID: id,
      };

      ws.send(JSON.stringify(zahtev));

      console.log("Veza uspesno uspostavljena, sa id: " + id);
      stanje.innerText = "Veza uspesno uspostavljena!";

      if (kolacici.g_id != null) {
        let zahtev = {
          metod: "rejoin",
          idKlijenta: id,
          idIgre: kolacici.g_id,
        };
        ws.send(JSON.stringify(zahtev));
      }
    }
    return;
  } //uspostavi vezu

  if (odgovor.metod === "igraJePopunjena") {
    stanje.innerText =
      "U toj igri vec igraju 2 igraca! Molimo napravite novu igru.";
    bojaP.innerText = "";
    return;
  }

  if (odgovor.metod === "rejoin") {
    idIgre = odgovor.idIgre;
    igra = odgovor.igra;
    potez = igra.igracNaRedu;
    igraGotova = igra.brojPoteza > 42;
    brojIgraca = odgovor.igrac.boja === "red" ? 0 : 1;
    bojaIgraca = odgovor.igrac.boja;


    if (brojIgraca === 0) bojaP.textContent = "Ti si crveni igrac";
    else bojaP.textContent = "Ti si zuti  igrac";

    if (igra.igracNaRedu == brojIgraca) {
      stanje.innerText = "Tvoj potez!";
      naPotezu = true;
    } else {
      stanje.innerText = "Protivnikov potez!";
      naPotezu = false;
    }

    for (let k = 0; k < 7; k++) {
      for (let r = 5; r >= 6 - igra.tabla[k].length; r--) {
        polja[r * 7 + k].style.backgroundColor =
          igra.tabla[k][5 - r] === 0 ? "red" : "yellow";
      }
    }
    
    if (igra.igraci[(brojIgraca + 1) % 2].aktivan === false) {
      alert("Drugi igrac trenutno nije u ovoj igri!");
      return;
    }
    return;
  } 

  if (odgovor.metod === "novaIgra") {
    idIgre = odgovor.igra.id;
    brojIgraca = odgovor.igra.igraci.length - 1;
    bojaIgraca = odgovor.igra.igraci[brojIgraca].boja;
    stanje.innerText = "Nova igra ima id: " + odgovor.igra.id;
    igraGotova = false;

    ocistiTablu();

    bojaP.innerText = "";

    document.cookie = `g_id=${idIgre};expires=${dExpCookie.toUTCString()}`;

    console.log(
      "Uspesno napravljena nova igra sa id " +
      odgovor.igra.id +
      " Ti si igrac: " +
      brojIgraca
    );
    return;
  } //nova igra

  if (odgovor.metod === "pridruzi") {
    const igra = odgovor.igra;
    idIgre = odgovor.idIgre;
    igraGotova = false;
    if (brojIgraca == null) {
      brojIgraca = odgovor.igra.igraci.length - 1;
      bojaIgraca = odgovor.igra.igraci[odgovor.igra.igraci.length - 1].boja;
    }
    if (brojIgraca === 0) bojaP.textContent = "Ti si crveni igrac";
    else bojaP.textContent = "Ti si zuti  igrac";

    ocistiTablu();

    document.cookie = `g_id=${idIgre};expires=${dExpCookie.toUTCString()}`;

    if (igra.igracNaRedu == brojIgraca) {
      stanje.innerText = "Tvoj potez!";
      naPotezu = true;
    } else {
      stanje.innerText = "Protivnikov potez!";
      naPotezu = false;
    }
    console.log("Pridruzio se i drugi igrac");
    console.log("Moj broj " + brojIgraca);
    return;
  } 

  if (odgovor.metod === "potez") {
    const igra = odgovor.igra;

    polja[odgovor.red * 7 + (odgovor.kolona % 7)].style.backgroundColor =
      odgovor.boja;

    if (igra.igracNaRedu == brojIgraca) {
      stanje.innerText = "Tvoj potez!";
      naPotezu = true;
    } else {
      stanje.innerText = "Protivnikov potez!";
      naPotezu = false;
    }

    return;
  } 

  if (odgovor.metod === "krajIgre") {
    const igra = odgovor.igra;

    if (odgovor.red != undefined) {
      polja[odgovor.red * 7 + (odgovor.kolona % 7)].style.backgroundColor =
        odgovor.boja;
    }

    igraGotova = true;

    if (odgovor.pobednik === brojIgraca) stanje.innerText = "POBEDIO SI :)";
    else if (odgovor.pobednik === null) stanje.innerText = "Igra je nerešena!";
    else stanje.innerText = "IZGUBIO SI :(";


    return;
  } 

  if (odgovor.metod === "reset") {
    const igra = odgovor.igra;
    ocistiTablu();
    if (igra.igracNaRedu == brojIgraca) {
      stanje.innerText = "Tvoj potez!";
      naPotezu = true;
    } else {
      stanje.innerText = "Protivnikov potez!";
      naPotezu = false;
    }
    igraGotova = false;
    potez = null;

    return;
  } 
  //igracNapustio
  if (odgovor.metod === "igracNapustio") {
    stanje.innerText = "Protivnik je napustio igru!";
    return;
  } //igracNapustio

  //nemogucPotez
  if (odgovor.metod === "nemogucPotez") {
    stanje.innerText = "Tvoj potez: Ovaj potez je nemoguć!";
    return;
  } //nemogucPotez

  //protivnikVratio
  if (odgovor.metod === "protivnikVratio") {
    if (odgovor.igra.igracNaRedu == brojIgraca) {
      stanje.innerText = "Tvoj potez!";
    } else {
      stanje.innerText = "Protivnikov potez!";
    }
    stanje.innerText += " Protivnik je ponovo u igri!";//DODALA
    return;
  } //protivnikVratio

  //istekloVreme
  if (odgovor.metod === "istekloVreme") {
    const igra = odgovor.igra;
    

    if (igra.igracNaRedu == brojIgraca)
      alert("Niste odigrali potez 60sek. Pozurite!");
    else alert("Protivnik se ne odaziva!");

    return;
  } //istekloVreme
};

function ocistiTablu() {
  for (let i = 0; i < polja.length; i++) {
    polja[i].style.backgroundColor = "white";
  }
}

function resetujTimer() {
  timer = 50;
}

function zapocniTimer() {
  timerId = setInterval(umanjiBrojac, 1000);
}

function zaustaviTimer() {
  clearInterval(timerId);
}

function umanjiBrojac() {
  if (timer > 0) {
    timer -= 1;
    headingTimer.innerText = timer;
  } else {
    zaustaviTimer();
    console.log("naPotezu", naPotezu);
    console.log("idIgre", idIgre);
    console.log("!igraGotova", !igraGotova);
    if (naPotezu && idIgre && !igraGotova) {
      const zahtev = {
        idKlijenta: id,
        metod: "istekloVreme",
        idIgre: idIgre,
      };
      console.log("isteklo");

      ws.send(JSON.stringify(zahtev));
    }
  }
}
