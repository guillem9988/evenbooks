import type { Locale } from "@/i18n/core";
import type { PrivacyContent } from "@/lib/privacy-content";

/** Same shape as the privacy policy: the operator's name and email come from the deployment settings. */
export const TERMS_UPDATED = "2026-10-13";

export const TERMS: Record<Locale, PrivacyContent> = {
  ca: {
    title: "Condicions d’ús i avís legal",
    updated: "Darrera actualització",
    controllerLabel: "Titular",
    contactLabel: "Contacte",
    unconfigured: "La persona que gestiona aquesta instància encara no ha publicat les seves dades de contacte.",
    sections: [
      {
        title: "1. Qui ofereix el servei",
        paragraphs: [
          "Evenbooks és un servei web gestionat per la persona indicada a dalt (el titular). Per a qualsevol consulta, escriu al correu de contacte. En crear un compte o fer servir el servei acceptes aquestes condicions i la política de privacitat.",
        ],
      },
      {
        title: "2. Què és Evenbooks",
        paragraphs: [
          "Una eina per ajudar autònoms i petites empreses a portar factures emeses, despeses, pressupostos, la conciliació amb el banc i una previsió dels impostos trimestrals.",
        ],
      },
      {
        title: "3. No és assessorament fiscal ni comptable",
        paragraphs: [
          "Els imports, les previsions dels models 303 i 130 i qualsevol altre càlcul són orientatius. Les dades que llegeix la IA a partir de factures i tiquets poden tenir errors.",
          "Ets tu qui ha de revisar les dades i les declaracions abans de presentar-les, i et recomanem fer-ho amb la teva gestoria. Evenbooks no presenta res a l’Agència Tributària en nom teu.",
        ],
      },
      {
        title: "4. El teu compte",
        paragraphs: [
          "Has de donar dades certes, guardar la contrasenya de manera segura i avisar-nos si creus que algú ha entrat al teu compte. Ets responsable del que es fa des del teu compte.",
        ],
      },
      {
        title: "5. Ús acceptable",
        paragraphs: ["No pots fer servir Evenbooks per:"],
        list: [
          "pujar contingut il·legal o dades de terceres persones sense una base legal per fer-ho;",
          "intentar accedir a comptes o dades d’altres persones, o vulnerar la seguretat del servei;",
          "sobrecarregar el servei, automatitzar-ne l’ús de manera abusiva o crear diversos comptes per saltar-te els límits.",
        ],
      },
      {
        title: "6. El teu contingut",
        paragraphs: [
          "Les factures, contactes i dades que puges són teus. Només els fem servir per prestar-te el servei, tal com explica la política de privacitat. Has de tenir dret a pujar-los; si hi ha dades personals dels teus clients o proveïdors, en ets el responsable i Evenbooks les tracta per encàrrec teu.",
        ],
      },
      {
        title: "7. Servei gratuït, límits i disponibilitat",
        paragraphs: [
          "El servei és gratuït. La lectura amb IA amb el lector d’Evenbooks té un límit mensual de lectures per persona; si hi poses la teva pròpia clau d’IA, en tens l’ús i el cost sota la teva responsabilitat.",
          "No garantim que el servei estigui sempre disponible ni lliure d’errors. Podem canviar-lo o deixar d’oferir-lo; quan sigui possible, ho avisarem amb antelació perquè puguis descarregar les teves dades. Et recomanem descarregar periòdicament el paquet per a la gestoria com a còpia.",
        ],
      },
      {
        title: "8. Responsabilitat",
        paragraphs: [
          "El servei s’ofereix tal qual. En la mesura que la llei ho permeti, el titular no respon de danys indirectes, pèrdua de dades, sancions o recàrrecs derivats de l’ús de les dades o els càlculs de l’aplicació. Res d’aquestes condicions limita els drets que la llei et reconeix com a consumidor.",
        ],
      },
      {
        title: "9. Baixa",
        paragraphs: [
          "Pots esborrar el teu compte quan vulguis des de Configuració → Compte. Podem suspendre o tancar comptes que incompleixin aquestes condicions.",
        ],
      },
      {
        title: "10. Canvis i llei aplicable",
        paragraphs: [
          "Si canviem aquestes condicions, publicarem la nova versió aquí i, si el canvi és important, t’ho farem saber. S’apliquen les lleis espanyoles; si ets consumidor, pots acudir als tribunals del teu domicili.",
          "El codi font d’Evenbooks és obert (llicència MIT). Aquestes condicions s’apliquen al servei allotjat a evenbooks.app.",
        ],
      },
    ],
  },
  es: {
    title: "Condiciones de uso y aviso legal",
    updated: "Última actualización",
    controllerLabel: "Titular",
    contactLabel: "Contacto",
    unconfigured: "La persona que gestiona esta instancia aún no ha publicado sus datos de contacto.",
    sections: [
      {
        title: "1. Quién ofrece el servicio",
        paragraphs: [
          "Evenbooks es un servicio web gestionado por la persona indicada arriba (el titular). Para cualquier consulta, escribe al correo de contacto. Al crear una cuenta o usar el servicio aceptas estas condiciones y la política de privacidad.",
        ],
      },
      {
        title: "2. Qué es Evenbooks",
        paragraphs: [
          "Una herramienta para ayudar a autónomos y pequeñas empresas a llevar facturas emitidas, gastos, presupuestos, la conciliación con el banco y una previsión de los impuestos trimestrales.",
        ],
      },
      {
        title: "3. No es asesoramiento fiscal ni contable",
        paragraphs: [
          "Los importes, las previsiones de los modelos 303 y 130 y cualquier otro cálculo son orientativos. Los datos que lee la IA a partir de facturas y tiques pueden contener errores.",
          "Eres tú quien debe revisar los datos y las declaraciones antes de presentarlas, y te recomendamos hacerlo con tu gestoría. Evenbooks no presenta nada a la Agencia Tributaria en tu nombre.",
        ],
      },
      {
        title: "4. Tu cuenta",
        paragraphs: [
          "Debes dar datos ciertos, guardar la contraseña de forma segura y avisarnos si crees que alguien ha entrado en tu cuenta. Eres responsable de lo que se hace desde tu cuenta.",
        ],
      },
      {
        title: "5. Uso aceptable",
        paragraphs: ["No puedes usar Evenbooks para:"],
        list: [
          "subir contenido ilegal o datos de terceras personas sin una base legal para hacerlo;",
          "intentar acceder a cuentas o datos de otras personas, o vulnerar la seguridad del servicio;",
          "sobrecargar el servicio, automatizar su uso de forma abusiva o crear varias cuentas para saltarte los límites.",
        ],
      },
      {
        title: "6. Tu contenido",
        paragraphs: [
          "Las facturas, contactos y datos que subes son tuyos. Solo los usamos para prestarte el servicio, tal como explica la política de privacidad. Debes tener derecho a subirlos; si hay datos personales de tus clientes o proveedores, tú eres el responsable y Evenbooks los trata por encargo tuyo.",
        ],
      },
      {
        title: "7. Servicio gratuito, límites y disponibilidad",
        paragraphs: [
          "El servicio es gratuito. La lectura con IA con el lector de Evenbooks tiene un límite mensual de lecturas por persona; si pones tu propia clave de IA, su uso y su coste corren de tu cuenta.",
          "No garantizamos que el servicio esté siempre disponible ni libre de errores. Podemos cambiarlo o dejar de ofrecerlo; cuando sea posible, lo avisaremos con antelación para que puedas descargar tus datos. Te recomendamos descargar periódicamente el paquete para la gestoría como copia.",
        ],
      },
      {
        title: "8. Responsabilidad",
        paragraphs: [
          "El servicio se ofrece tal cual. En la medida en que la ley lo permita, el titular no responde de daños indirectos, pérdida de datos, sanciones o recargos derivados del uso de los datos o los cálculos de la aplicación. Nada de estas condiciones limita los derechos que la ley te reconoce como consumidor.",
        ],
      },
      {
        title: "9. Baja",
        paragraphs: [
          "Puedes borrar tu cuenta cuando quieras desde Configuración → Cuenta. Podemos suspender o cerrar cuentas que incumplan estas condiciones.",
        ],
      },
      {
        title: "10. Cambios y ley aplicable",
        paragraphs: [
          "Si cambiamos estas condiciones, publicaremos la nueva versión aquí y, si el cambio es importante, te lo haremos saber. Se aplican las leyes españolas; si eres consumidor, puedes acudir a los tribunales de tu domicilio.",
          "El código fuente de Evenbooks es abierto (licencia MIT). Estas condiciones se aplican al servicio alojado en evenbooks.app.",
        ],
      },
    ],
  },
  en: {
    title: "Terms of use and legal notice",
    updated: "Last updated",
    controllerLabel: "Operator",
    contactLabel: "Contact",
    unconfigured: "The person who runs this instance has not published their contact details yet.",
    sections: [
      {
        title: "1. Who provides the service",
        paragraphs: [
          "Evenbooks is a web service run by the person named above (the operator). For any question, write to the contact address. By creating an account or using the service you accept these terms and the privacy policy.",
        ],
      },
      {
        title: "2. What Evenbooks is",
        paragraphs: [
          "A tool that helps freelancers and small businesses keep track of issued invoices, expenses, quotes, bank reconciliation and an estimate of quarterly taxes.",
        ],
      },
      {
        title: "3. Not tax or accounting advice",
        paragraphs: [
          "Amounts, Modelo 303 and 130 estimates and any other calculation are for guidance only. Data the AI reads from invoices and receipts may contain mistakes.",
          "You are responsible for checking the data and your returns before filing them, ideally with your accountant. Evenbooks does not file anything with the Tax Agency on your behalf.",
        ],
      },
      {
        title: "4. Your account",
        paragraphs: [
          "Give accurate details, keep your password safe and tell us if you think someone has accessed your account. You are responsible for what is done from your account.",
        ],
      },
      {
        title: "5. Acceptable use",
        paragraphs: ["You may not use Evenbooks to:"],
        list: [
          "upload illegal content, or other people's data without a legal basis to do so;",
          "try to access other people's accounts or data, or break the security of the service;",
          "overload the service, automate its use abusively, or create several accounts to get around the limits.",
        ],
      },
      {
        title: "6. Your content",
        paragraphs: [
          "The invoices, contacts and data you upload are yours. We only use them to provide the service, as the privacy policy explains. You must have the right to upload them; where they include personal data of your clients or suppliers, you are the controller and Evenbooks processes it on your behalf.",
        ],
      },
      {
        title: "7. Free service, limits and availability",
        paragraphs: [
          "The service is free. AI reading with the Evenbooks reader has a monthly limit per person; if you add your own AI key, its use and cost are your responsibility.",
          "We do not guarantee the service will always be available or free of errors. We may change it or stop offering it; where possible we will give notice so you can download your data. We recommend downloading the accountant package regularly as a backup.",
        ],
      },
      {
        title: "8. Liability",
        paragraphs: [
          "The service is provided as is. To the extent the law allows, the operator is not liable for indirect damage, data loss, penalties or surcharges arising from the use of the app's data or calculations. Nothing in these terms limits your statutory rights as a consumer.",
        ],
      },
      {
        title: "9. Leaving",
        paragraphs: [
          "You can delete your account at any time from Settings → Account. We may suspend or close accounts that break these terms.",
        ],
      },
      {
        title: "10. Changes and governing law",
        paragraphs: [
          "If we change these terms we will publish the new version here and, if the change is significant, let you know. Spanish law applies; if you are a consumer, you may go to the courts of your place of residence.",
          "Evenbooks' source code is open (MIT licence). These terms apply to the service hosted at evenbooks.app.",
        ],
      },
    ],
  },
};
