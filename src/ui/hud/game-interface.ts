export function configureGameInterface(): void {
  document.documentElement.classList.add('game-interface');
  document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  document.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]'))) event.preventDefault();
  });
}
