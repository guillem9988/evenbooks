import type { Locale } from "@/i18n/core";

export interface PrivacySection {
  title: string;
  paragraphs: string[];
  list?: string[];
}

export interface PrivacyContent {
  title: string;
  updated: string;
  controllerLabel: string;
  contactLabel: string;
  unconfigured: string;
  sections: PrivacySection[];
}

/** Identity of whoever runs this instance; set per deployment so it is not hard-coded in the repository. */
export const PRIVACY_CONTROLLER = process.env.NEXT_PUBLIC_PRIVACY_CONTROLLER?.trim() || null;
export const PRIVACY_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() || null;

export const PRIVACY_UPDATED = "2026-10-05";

export const PRIVACY: Record<Locale, PrivacyContent> = {
  ca: {
    title: "Política de privacitat",
    updated: "Darrera actualització",
    controllerLabel: "Responsable",
    contactLabel: "Contacte de privacitat",
    unconfigured: "La persona que gestiona aquesta instància encara no ha publicat les seves dades de contacte.",
    sections: [
      {
        title: "1. Qui tracta les teves dades",
        paragraphs: [
          "El responsable del tractament és la persona indicada a dalt, que gestiona aquesta instància de MatchInvoice. Per a qualsevol qüestió de privacitat, escriu al correu de contacte.",
        ],
      },
      {
        title: "2. Quines dades tractem",
        paragraphs: ["Només les que tu introdueixes o puges per fer servir l’aplicació:"],
        list: [
          "Compte: nom, correu electrònic, contrasenya (guardada xifrada, mai en clar) o identificador de Google si entres amb Google, i la foto de perfil de Google.",
          "Empresa: raó social i NIF de les organitzacions que crees.",
          "Contactes: dades dels teus clients i proveïdors (nom, NIF, correu).",
          "Documents: factures emeses, pressupostos, factures i tiquets de despesa que puges (fitxers i dades extretes: proveïdor, NIF, imports, dates).",
          "Banc: moviments dels extractes bancaris que importes.",
          "Dades tècniques: adreça IP i registres del servidor necessaris per a la seguretat i per resoldre errors.",
        ],
      },
      {
        title: "3. Per a què i amb quina base legal",
        paragraphs: [
          "Per prestar-te el servei que demanes (facturar, llegir despeses, conciliar el banc, calcular impostos): execució del contracte (art. 6.1.b RGPD).",
          "Per protegir el servei contra abusos i atacs (límits d’ús, registres de seguretat): interès legítim (art. 6.1.f RGPD).",
          "Per enviar-te correus del servei (confirmació del correu, factures que tu decideixes enviar): execució del contracte. No enviem publicitat.",
        ],
      },
      {
        title: "4. Lectura automàtica amb IA",
        paragraphs: [
          "Quan puges una factura o un tiquet, el document s’envia a un proveïdor d’intel·ligència artificial (per defecte Google Gemini) perquè n’extregui les dades. Amb el pla gratuït de Google Gemini, Google pot fer servir el contingut enviat per millorar els seus productes i pot ser revisat per persones.",
          "No hi pugis documents amb dades que no vulguis compartir amb aquest proveïdor. Pots configurar la teva pròpia clau d’IA a Configuració o fer servir el mode de lectura local, que no envia el document a tercers.",
        ],
      },
      {
        title: "5. Proveïdors que intervenen",
        paragraphs: ["Fem servir aquests proveïdors com a encarregats del tractament:"],
        list: [
          "Render (servidor de l’aplicació).",
          "Vercel (web).",
          "Supabase (base de dades i emmagatzematge de fitxers).",
          "Upstash (cua de processament).",
          "Google (inici de sessió amb Google i lectura amb IA via Gemini).",
          "Resend (enviament de correus), si està activat.",
        ],
      },
      {
        title: "6. Transferències fora de l’Espai Econòmic Europeu",
        paragraphs: [
          "Alguns d’aquests proveïdors guarden o processen dades fora de l’EEE (per exemple als Estats Units, Singapur o Austràlia). Aquestes transferències es fan amb les garanties que preveu el RGPD, com les clàusules contractuals tipus de la Comissió Europea.",
        ],
      },
      {
        title: "7. Quant de temps les guardem",
        paragraphs: [
          "Mentre tinguis el compte actiu. Pots esborrar-lo tu mateix a Configuració → Esborra el compte, o demanar-ho al correu de contacte. Quan s’esborra el compte, eliminarem les teves dades en un termini raonable, excepte les que la llei obligui a conservar. Recorda que la normativa fiscal pot obligar-te a tu a conservar les factures durant anys: descarrega-les abans d’esborrar el compte.",
        ],
      },
      {
        title: "8. Els teus drets",
        paragraphs: [
          "Pots exercir els drets d’accés, rectificació, supressió, oposició, limitació i portabilitat escrivint al correu de contacte. Si creus que no s’han respectat, pots presentar una reclamació a l’Agència Espanyola de Protecció de Dades (www.aepd.es).",
        ],
      },
      {
        title: "9. Galetes i emmagatzematge local",
        paragraphs: [
          "Només fem servir una galeta tècnica imprescindible per mantenir la sessió iniciada i, durant l’inici de sessió amb Google, una galeta temporal de seguretat. El navegador guarda localment l’idioma i el tema que tries. No fem servir galetes d’analítica ni de publicitat.",
        ],
      },
      {
        title: "10. Canvis",
        paragraphs: ["Si canviem aquesta política, n’actualitzarem la data. Els canvis importants els avisarem dins l’aplicació."],
      },
    ],
  },
  es: {
    title: "Política de privacidad",
    updated: "Última actualización",
    controllerLabel: "Responsable",
    contactLabel: "Contacto de privacidad",
    unconfigured: "La persona que gestiona esta instancia todavía no ha publicado sus datos de contacto.",
    sections: [
      {
        title: "1. Quién trata tus datos",
        paragraphs: [
          "El responsable del tratamiento es la persona indicada arriba, que gestiona esta instancia de MatchInvoice. Para cualquier cuestión de privacidad, escribe al correo de contacto.",
        ],
      },
      {
        title: "2. Qué datos tratamos",
        paragraphs: ["Solo los que tú introduces o subes para usar la aplicación:"],
        list: [
          "Cuenta: nombre, correo electrónico, contraseña (guardada cifrada, nunca en claro) o identificador de Google si entras con Google, y la foto de perfil de Google.",
          "Empresa: razón social y NIF de las organizaciones que creas.",
          "Contactos: datos de tus clientes y proveedores (nombre, NIF, correo).",
          "Documentos: facturas emitidas, presupuestos, facturas y tiques de gasto que subes (archivos y datos extraídos: proveedor, NIF, importes, fechas).",
          "Banco: movimientos de los extractos bancarios que importas.",
          "Datos técnicos: dirección IP y registros del servidor necesarios para la seguridad y para resolver errores.",
        ],
      },
      {
        title: "3. Para qué y con qué base legal",
        paragraphs: [
          "Para prestarte el servicio que pides (facturar, leer gastos, conciliar el banco, calcular impuestos): ejecución del contrato (art. 6.1.b RGPD).",
          "Para proteger el servicio contra abusos y ataques (límites de uso, registros de seguridad): interés legítimo (art. 6.1.f RGPD).",
          "Para enviarte correos del servicio (confirmación del correo, facturas que tú decides enviar): ejecución del contrato. No enviamos publicidad.",
        ],
      },
      {
        title: "4. Lectura automática con IA",
        paragraphs: [
          "Cuando subes una factura o un tique, el documento se envía a un proveedor de inteligencia artificial (por defecto Google Gemini) para que extraiga los datos. Con el plan gratuito de Google Gemini, Google puede usar el contenido enviado para mejorar sus productos y puede ser revisado por personas.",
          "No subas documentos con datos que no quieras compartir con este proveedor. Puedes configurar tu propia clave de IA en Configuración o usar el modo de lectura local, que no envía el documento a terceros.",
        ],
      },
      {
        title: "5. Proveedores que intervienen",
        paragraphs: ["Usamos estos proveedores como encargados del tratamiento:"],
        list: [
          "Render (servidor de la aplicación).",
          "Vercel (web).",
          "Supabase (base de datos y almacenamiento de archivos).",
          "Upstash (cola de procesamiento).",
          "Google (inicio de sesión con Google y lectura con IA vía Gemini).",
          "Resend (envío de correos), si está activado.",
        ],
      },
      {
        title: "6. Transferencias fuera del Espacio Económico Europeo",
        paragraphs: [
          "Algunos de estos proveedores guardan o procesan datos fuera del EEE (por ejemplo en Estados Unidos, Singapur o Australia). Estas transferencias se hacen con las garantías que prevé el RGPD, como las cláusulas contractuales tipo de la Comisión Europea.",
        ],
      },
      {
        title: "7. Cuánto tiempo los guardamos",
        paragraphs: [
          "Mientras tengas la cuenta activa. Puedes borrarla tú mismo en Configuración → Borrar la cuenta, o pedirlo al correo de contacto. Cuando se borra la cuenta, eliminaremos tus datos en un plazo razonable, salvo los que la ley obligue a conservar. Recuerda que la normativa fiscal puede obligarte a ti a conservar las facturas durante años: descárgalas antes de borrar la cuenta.",
        ],
      },
      {
        title: "8. Tus derechos",
        paragraphs: [
          "Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo al correo de contacto. Si crees que no se han respetado, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).",
        ],
      },
      {
        title: "9. Cookies y almacenamiento local",
        paragraphs: [
          "Solo usamos una cookie técnica imprescindible para mantener la sesión iniciada y, durante el inicio de sesión con Google, una cookie temporal de seguridad. El navegador guarda localmente el idioma y el tema que eliges. No usamos cookies de analítica ni de publicidad.",
        ],
      },
      {
        title: "10. Cambios",
        paragraphs: ["Si cambiamos esta política, actualizaremos la fecha. Los cambios importantes los avisaremos dentro de la aplicación."],
      },
    ],
  },
  en: {
    title: "Privacy policy",
    updated: "Last updated",
    controllerLabel: "Controller",
    contactLabel: "Privacy contact",
    unconfigured: "The person running this instance has not published their contact details yet.",
    sections: [
      {
        title: "1. Who processes your data",
        paragraphs: [
          "The data controller is the person named above, who runs this MatchInvoice instance. For any privacy question, write to the contact address.",
        ],
      },
      {
        title: "2. What data we process",
        paragraphs: ["Only what you enter or upload to use the app:"],
        list: [
          "Account: name, email address, password (stored hashed, never in plain text) or Google identifier if you sign in with Google, and your Google profile picture.",
          "Business: legal name and tax ID of the organizations you create.",
          "Contacts: details of your clients and suppliers (name, tax ID, email).",
          "Documents: issued invoices, quotes, and the expense invoices and receipts you upload (files and extracted data: vendor, tax ID, amounts, dates).",
          "Bank: transactions from the bank statements you import.",
          "Technical data: IP address and server logs needed for security and troubleshooting.",
        ],
      },
      {
        title: "3. Why, and on what legal basis",
        paragraphs: [
          "To provide the service you ask for (invoicing, reading expenses, bank reconciliation, tax previews): performance of a contract (Art. 6(1)(b) GDPR).",
          "To protect the service from abuse and attacks (usage limits, security logs): legitimate interest (Art. 6(1)(f) GDPR).",
          "To send you service emails (email confirmation, invoices you choose to send): performance of a contract. We do not send marketing.",
        ],
      },
      {
        title: "4. Automatic reading with AI",
        paragraphs: [
          "When you upload an invoice or receipt, the document is sent to an AI provider (Google Gemini by default) to extract its data. On Google Gemini's free tier, Google may use submitted content to improve its products and it may be reviewed by humans.",
          "Don't upload documents containing data you don't want to share with that provider. You can set your own AI key in Settings or use local reading mode, which does not send the document to third parties.",
        ],
      },
      {
        title: "5. Providers involved",
        paragraphs: ["We use these providers as data processors:"],
        list: [
          "Render (application server).",
          "Vercel (website).",
          "Supabase (database and file storage).",
          "Upstash (processing queue).",
          "Google (Google sign-in and AI reading via Gemini).",
          "Resend (email delivery), when enabled.",
        ],
      },
      {
        title: "6. Transfers outside the European Economic Area",
        paragraphs: [
          "Some of these providers store or process data outside the EEA (for example in the United States, Singapore or Australia). These transfers rely on the safeguards provided by the GDPR, such as the European Commission's standard contractual clauses.",
        ],
      },
      {
        title: "7. How long we keep it",
        paragraphs: [
          "For as long as your account is active. You can delete it yourself in Settings → Delete account, or ask at the contact address. When an account is deleted, we will delete your data within a reasonable time, except what the law requires us to keep. Tax rules may require you to keep your invoices for years: download them before deleting your account.",
        ],
      },
      {
        title: "8. Your rights",
        paragraphs: [
          "You can exercise your rights of access, rectification, erasure, objection, restriction and portability by writing to the contact address. If you believe they have not been respected, you can complain to the Spanish Data Protection Agency (www.aepd.es) or your local authority.",
        ],
      },
      {
        title: "9. Cookies and local storage",
        paragraphs: [
          "We only use one strictly necessary cookie to keep you signed in and, during Google sign-in, a temporary security cookie. Your browser stores your chosen language and theme locally. We do not use analytics or advertising cookies.",
        ],
      },
      {
        title: "10. Changes",
        paragraphs: ["If we change this policy we will update the date above. We will announce significant changes inside the app."],
      },
    ],
  },
};
