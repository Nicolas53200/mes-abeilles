/* Installation et durabilité du stockage.
   Tout le carnet vit dans le stockage local : sans demande explicite, le
   navigateur peut le purger pour libérer de la place. */

import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

export default () => executerSuite('Installation et stockage durable', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, RUCHER_TYPE);
  await page.goto(origine);
  await page.waitForTimeout(1400);

  rapport.section('Le stockage durable est réellement demandé');
  const api = await page.evaluate(() => ({
    fonctionPresente: typeof demanderStockageDurable === 'function',
    estimationPresente: typeof estimationStockage === 'function',
    apiNavigateur: !!(navigator.storage && navigator.storage.persist)
  }));
  rapport.verifier('demanderStockageDurable() définie', api.fonctionPresente);
  rapport.verifier('estimationStockage() définie', api.estimationPresente);
  rapport.verifier('API navigateur disponible ici', api.apiNavigateur, String(api.apiNavigateur));

  const resultat = await page.evaluate(() => demanderStockageDurable());
  rapport.verifier('la demande aboutit sans exception',
    resultat === true || resultat === false || resultat === null, String(resultat));
  const persisted = await page.evaluate(async () =>
    navigator.storage?.persisted ? await navigator.storage.persisted() : null);
  rapport.verifier('état de persistance lisible', persisted !== undefined, String(persisted));

  rapport.section('Aucune dépendance : tout doit survivre à l\'absence d\'API');
  const sansApi = await page.evaluate(async () => {
    const vrai = navigator.storage;
    try {
      Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
      const r = await demanderStockageDurable();
      const e = await estimationStockage();
      return { r, e, planté: false };
    } catch(err) {
      return { planté: true, err: err.message };
    } finally {
      Object.defineProperty(navigator, 'storage', { value: vrai, configurable: true });
    }
  });
  rapport.verifier('sans API storage : aucune exception', !sansApi.planté, sansApi.err || 'ok');
  rapport.verifier('renvoie null plutôt que de casser', sansApi.r === null && sansApi.e === null);

  rapport.section('Proposition d\'installation');
  const avant = await page.evaluate(() => ({
    proposee: peutProposerInstallation(),
    banniere: (document.getElementById('content')?.innerText || '').includes("Installer l'application")
  }));
  rapport.verifier('non proposée sans événement du navigateur', !avant.proposee || avant.banniere,
    `proposée=${avant.proposee}`);

  // Simule l'événement que le navigateur émet quand l'app est installable
  const apres = await page.evaluate(() => {
    const ev = new Event('beforeinstallprompt');
    ev.prompt = () => {};
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
    showPage('home');
    return {
      proposee: peutProposerInstallation(),
      texte: document.getElementById('content')?.innerText || ''
    };
  });
  rapport.verifier('devient proposée après beforeinstallprompt', apres.proposee);
  rapport.verifier('l\'encart apparaît sur l\'accueil', apres.texte.includes("Installer l'application"));
  rapport.verifier('le bénéfice est expliqué', /données mieux protégées/i.test(apres.texte));

  const clic = await page.evaluate(async () => {
    const b = [...document.querySelectorAll('button')].find(x => /Installer/.test(x.textContent));
    if(!b) return { bouton:false };
    b.click();
    await new Promise(r => setTimeout(r, 300));
    return { bouton:true, encoreProposee: peutProposerInstallation() };
  });
  rapport.verifier('bouton présent et cliquable', clic.bouton);
  rapport.verifier('l\'invite n\'est pas rejouée après usage', clic.encoreProposee === false);

  rapport.section('Une app déjà installée ne propose plus rien');
  const installee = await page.evaluate(() => {
    const vrai = window.matchMedia;
    window.matchMedia = q => /standalone/.test(q) ? { matches:true } : vrai.call(window, q);
    const r = { dejaInstallee: appDejaInstallee(), proposee: peutProposerInstallation() };
    window.matchMedia = vrai;
    return r;
  });
  rapport.verifier('mode autonome détecté', installee.dejaInstallee);
  rapport.verifier('plus de proposition d\'installation', !installee.proposee);

  rapport.section('Encart de stockage dans Administration');
  await page.evaluate(() => showPage('admin'));
  await page.waitForTimeout(800);
  const admin = await page.evaluate(() => document.getElementById('etatStockageTexte')?.textContent || '');
  rapport.verifier('encart renseigné', admin.length > 40 && !admin.includes('Vérification en cours'),
    admin.slice(0, 90));
  rapport.verifier('mentionne l\'appareil', /cet appareil/i.test(admin));
  rapport.verifier('rappelle d\'exporter', /export/i.test(admin));

  rapport.section('Rien ne fuit dans la sauvegarde');
  const propre = await page.evaluate(() => {
    saveState();
    const brut = localStorage.getItem('mesAbeilles_data_v1') || '';
    return { prompt: /promptInstallation/.test(brut), durable: /stockageDurable/.test(brut),
             dansState: Object.keys(state).some(k => /install|stockage/i.test(k)) };
  });
  rapport.verifier('promptInstallation absent du localStorage', !propre.prompt);
  rapport.verifier('stockageDurable absent du localStorage', !propre.durable);
  rapport.verifier('rien ajouté à l\'objet state', !propre.dansState);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
