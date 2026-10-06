import { navbarHTML } from '../components/navbar.js';
import { mainHTML } from '../components/main.js';
import { footerHTML } from '../components/footer.js';
import { modalHTML, initWelcomeModal } from '../components/welcome.js';

document.getElementById('app-navbar').innerHTML = navbarHTML;
document.getElementById('app-main').innerHTML = mainHTML;
document.getElementById('app-footer').innerHTML = footerHTML;

const modalContainer = document.createElement('div');
modalContainer.innerHTML = modalHTML;
document.body.appendChild(modalContainer.firstElementChild);

initWelcomeModal();

import('../js/app.js').catch(console.error);