export class OverlayView {
  constructor() {
    this.container = document.getElementById('overlay');
    this.message = document.getElementById('overlay-msg');
    this.debugConsole = document.getElementById('debug-console');
    this.closeButton = document.getElementById('btn-fechar-overlay');

    this.closeButton.addEventListener('click', () => {
      this.hide();
    });
  }

  show(message) {
    this.container.classList.remove('hidden');
    this.message.innerText = message;
    this.closeButton.classList.add('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
    this.debugConsole.innerHTML = '';
    this.closeButton.classList.add('hidden');
  }

  log(line) {
    const row = document.createElement('div');
    row.textContent = `> ${line}`;
    this.debugConsole.appendChild(row);
    this.debugConsole.scrollTop = this.debugConsole.scrollHeight;
  }

  showError(line) {
    this.log(`ERROR: ${line}`);
    this.closeButton.classList.remove('hidden');
  }
}
