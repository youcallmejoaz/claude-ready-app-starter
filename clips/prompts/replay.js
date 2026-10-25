// Types the prompt, then reveals the result lines one by one. Timings are fixed so every recording is identical.
function replay({ prompt, cps = 32, startDelay = 500, lineDelay = 300, afterPrompt = 700 }) {
  const p = document.getElementById("typed");
  const lines = [...document.querySelectorAll(".out div")];
  let i = 0;
  setTimeout(function type() {
    p.textContent = prompt.slice(0, ++i);
    if (i < prompt.length) setTimeout(type, 1000 / cps);
    else {
      document.querySelector(".caret").style.display = "none";
      lines.forEach((l, n) => setTimeout(() => l.classList.add("show"), afterPrompt + n * lineDelay));
    }
  }, startDelay);
}
