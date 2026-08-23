/* Validation du profil : elle doit guider sans jamais bloquer.
   Le point critique est qu'un champ mal formé n'empêche PAS
   l'enregistrement — sur le terrain, personne ne doit rester coincé. */

import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

export default () => executerSuite('Validation de saisie', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, RUCHER_TYPE);
  await page.goto(origine);
  await page.waitForTimeout(1100);

  rapport.section('Clé de Luhn du SIRET');
  // SIRET réels et valides (sièges d'entreprises françaises connues)
  for(const [valeur, attendu, note] of [
    ['73282932000074', true,  'SIRET valide'],
    ['55208131766522', true,  'SIRET valide'],
    ['73282932000075', false, 'dernier chiffre faux'],
    ['73282932000',    false, 'trop court'],
    ['7328293200007A', false, 'contient une lettre'],
    ['00000000000000', true,  'que des zéros — Luhn passe, cas limite assumé']
  ]){
    const obtenu = await page.evaluate(v => siretValide(v), valeur);
    rapport.verifier(`${valeur.padEnd(15)} ${note}`, obtenu === attendu, obtenu ? 'accepté' : 'rejeté');
  }

  rapport.section('Anomalies détectées');
  for(const [profil, doitSignaler, note] of [
    [{ siret:'73282932000074', telephone:'0612345678', email:'a@b.fr', napi:'12345' }, false, 'profil correct'],
    [{ siret:'123' },                     true,  'SIRET trop court'],
    [{ telephone:'06 12 34' },            true,  'téléphone incomplet'],
    [{ email:'pas-une-adresse' },         true,  'e-mail sans @'],
    [{ napi:'ABC' },                      true,  'NAPI non numérique'],
    [{},                                  false, 'profil vide : aucun reproche'],
    [{ telephone:'+33612345678' },        false, 'téléphone au format international'],
    [{ telephone:'06.12.34.56.78' },      false, 'téléphone avec séparateurs'],
    [{ siret:'732 829 320 00074' },       false, 'SIRET avec espaces']
  ]){
    const soucis = await page.evaluate(p => anomaliesProfil(p), profil);
    const signale = soucis.length > 0;
    rapport.verifier(note.padEnd(34), signale === doitSignaler, soucis[0] || 'rien à signaler');
  }

  rapport.section('La sauvegarde n\'est JAMAIS bloquée');
  const resultat = await page.evaluate(() => {
    showPage('admin');
    const mettre = (id, v) => { const e = document.getElementById(id); if(e) e.value = v; };
    mettre('adminPrenom', '  Nicolas  ');
    mettre('adminSiret', '123');            // invalide
    mettre('adminTelephone', 'pas un numéro'); // invalide
    mettre('adminEmail', 'cassé');            // invalide
    saveAdmin();
    const enregistre = JSON.parse(localStorage.getItem('mesAbeilles_data_v1') || '{}').profil || {};
    return { siret: enregistre.siret, tel: enregistre.telephone,
             email: enregistre.email, prenom: enregistre.prenom,
             toast: document.getElementById('toast')?.textContent || '' };
  });
  rapport.verifier('SIRET invalide tout de même enregistré', resultat.siret === '123');
  rapport.verifier('téléphone invalide tout de même enregistré', resultat.tel === 'pas un numéro');
  rapport.verifier('e-mail invalide tout de même enregistré', resultat.email === 'cassé');
  rapport.verifier('espaces superflus retirés', resultat.prenom === 'Nicolas', `« ${resultat.prenom} »`);
  rapport.verifier('l\'utilisateur est averti', resultat.toast.includes('à vérifier'), `« ${resultat.toast} »`);

  rapport.section('Claviers mobiles adaptés');
  const attributs = await page.evaluate(() => {
    showPage('admin');
    const a = id => document.getElementById(id);
    return {
      siret: a('adminSiret')?.getAttribute('inputmode'),
      napi:  a('adminNapi')?.getAttribute('inputmode'),
      tel:   a('adminTelephone')?.getAttribute('type'),
      email: a('adminEmail')?.getAttribute('type'),
      plafond: a('adminSiret')?.getAttribute('maxlength')
    };
  });
  rapport.verifier('SIRET en pavé numérique', attributs.siret === 'numeric');
  rapport.verifier('NAPI en pavé numérique', attributs.napi === 'numeric');
  rapport.verifier('téléphone en type tel', attributs.tel === 'tel');
  rapport.verifier('e-mail en type email', attributs.email === 'email');
  rapport.verifier('longueur plafonnée', attributs.plafond === '17');

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
