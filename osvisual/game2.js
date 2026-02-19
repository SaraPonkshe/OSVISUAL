const startBtn = document.getElementById("startBtn");
const algoSelect = document.getElementById("algorithm");
const infoBox = document.getElementById("infoBox");
const gantt = document.getElementById("gantt");
const cars = [
  document.getElementById("p1"),
  document.getElementById("p2"),
  document.getElementById("p3"),
];

function resetRace() {
  cars.forEach(car => {
    car.style.left = "0";
    car.style.animation = "none";
    car.offsetHeight; // reflow
  });
  gantt.innerHTML = "";
  infoBox.innerHTML = "";
}

function animateCar(car, duration, delay) {
  car.style.animation = `race ${duration}s linear forwards`;
  car.style.animationDelay = `${delay}s`;
}

function showInfo(algorithm, details) {
  let html = `<h3>${algorithm} Details</h3><table border="1" style="width:100%; text-align:center; border-collapse:collapse;">
  <tr>
    <th>Process</th>
    ${Object.keys(details[0]).map(key => `<th>${key}</th>`).join("")}
  </tr>`;
  details.forEach((p, i) => {
    html += `<tr><td>P${i + 1}</td>${Object.values(p)
      .map(v => `<td>${v}</td>`)
      .join("")}</tr>`;
  });
  html += "</table>";
  infoBox.innerHTML = html;
}

function addGanttBar(id, color, widthPercent, delaySec, durationSec) {
  const bar = document.createElement("div");
  bar.classList.add("gantt-bar");
  bar.style.background = color;
  bar.style.setProperty("--width", `${widthPercent}%`);
  bar.textContent = id;
  bar.style.animationDuration = `${durationSec}s`;
  bar.style.animationDelay = `${delaySec}s`;
  bar.style.width = "0";
  bar.style.animationFillMode = "forwards";
  gantt.appendChild(bar);
}

startBtn.addEventListener("click", () => {
  resetRace();
  const algo = algoSelect.value;

  if (algo === "none") {
    alert("Please select an algorithm!");
    return;
  }

  if (algo === "fcfs") {
    const data = [
      { Arrival: 0, Burst: 5 },
      { Arrival: 2, Burst: 3 },
      { Arrival: 4, Burst: 6 },
    ];
    showInfo("FCFS", data);

    animateCar(cars[0], 5, 0);
    addGanttBar("P1", "#e63946", 20, 0, 5);

    animateCar(cars[1], 3, 5);
    addGanttBar("P2", "#2a9d8f", 12, 5, 3);

    animateCar(cars[2], 6, 8);
    addGanttBar("P3", "#457b9d", 24, 8, 6);
  }

  if (algo === "sjf") {
    const data = [
      { Burst: 6 },
      { Burst: 2 },
      { Burst: 4 },
    ];
    showInfo("SJF", data);

    animateCar(cars[1], 2, 0);
    addGanttBar("P2", "#2a9d8f", 15, 0, 2);

    animateCar(cars[2], 4, 2);
    addGanttBar("P3", "#457b9d", 30, 2, 4);

    animateCar(cars[0], 6, 6);
    addGanttBar("P1", "#e63946", 45, 6, 6);
  }

  if (algo === "priority") {
    const data = [
      { Burst: 5, Priority: 3 },
      { Burst: 4, Priority: 1 },
      { Burst: 6, Priority: 2 },
    ];
    showInfo("Priority Scheduling", data);

    animateCar(cars[1], 4, 0);
    addGanttBar("P2", "#2a9d8f", 25, 0, 4);

    animateCar(cars[2], 6, 4);
    addGanttBar("P3", "#457b9d", 35, 4, 6);

    animateCar(cars[0], 5, 10);
    addGanttBar("P1", "#e63946", 30, 10, 5);
  }

  if (algo === "rr") {
    const timeQuantum = 2;
    const data = [
      { Burst: 6, TimeQuantum: timeQuantum },
      { Burst: 4, TimeQuantum: timeQuantum },
      { Burst: 8, TimeQuantum: timeQuantum },
    ];
    showInfo("Round Robin", data);

    let delay = 0;
    for (let round = 0; round < 3; round++) {
      cars.forEach((car, i) => {
        animateCar(car, timeQuantum, delay);
        const colors = ["#e63946", "#2a9d8f", "#457b9d"];
        addGanttBar(`P${i + 1}`, colors[i], 10, delay, timeQuantum);
        delay += timeQuantum;
      });
    }
  }
});

