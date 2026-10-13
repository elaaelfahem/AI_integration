import { PrismaClient, DataSourceType, CollectionMethod } from '@prisma/client';

export async function seedDataSources(prisma: PrismaClient) {
  const superadmin = await prisma.account.findFirst({
    where: { account_type: 'SUPERADMIN' },
  });

  if (!superadmin) {
    console.log('Data sources seed skipped: no active superadmin found.');
    return;
  }

  const sources = [
    {
      name: 'Registre National des Entreprises (RNE)',
      type: DataSourceType.OFFICIAL_REGISTRY,
      collection_method: CollectionMethod.API,
      configuration_reference: 'https://www.registre-entreprises.tn',
      logo_url: 'https://i.ibb.co/VWs3JH8N/rne.png',
      description:
        "Registre public officiel de l'État tunisien centralisant les immatriculations légales, matricules fiscaux, formes juridiques, dirigeants déclarés et bilans financiers certifiés.",
      enabled: true,
    },
    {
      name: 'Orange DME Historical Data',
      type: DataSourceType.OTHER,
      collection_method: CollectionMethod.IMPORT,
      configuration_reference: 'https://dme.orange.tn/historical-data',
      logo_url: 'https://i.ibb.co/SXrHc5Qb/images-1.png',
      description:
        "Base historique consolidée Orange DME regroupant les données des entreprises clientes, antécédents d'engagement et indicateurs télécoms B2B.",
      enabled: true,
    },
    {
      name: 'Pages Jaunes Tunisie',
      type: DataSourceType.BUSINESS_DIRECTORY,
      collection_method: CollectionMethod.CRAWLING,
      configuration_reference: 'https://www.pagesjaunes.com.tn',
      logo_url: 'https://i.ibb.co/gLGZYJfP/pagejaunes.png',
      description:
        'Annuaire professionnel de référence en Tunisie recensant les commerces, professions libérales et PME avec numéros de téléphone fixes/mobiles vérifiés, adresses et emails directs.',
      enabled: true,
    },
    {
      name: 'Google Maps & Places API',
      type: DataSourceType.MAPS,
      collection_method: CollectionMethod.API,
      configuration_reference: 'https://maps.googleapis.com/maps/api/place',
      logo_url: 'https://unavatar.io/maps.google.com',
      description:
        'Cartographie géospatiale des points de présence physique, vérification des horaires d’activité, coordonnées GPS exactes et signaux de visibilité locale des établissements.',
      enabled: true,
    },
    {
      name: 'LinkedIn Business Data',
      type: DataSourceType.SOCIAL_NETWORK,
      collection_method: CollectionMethod.API,
      configuration_reference: 'https://api.linkedin.com/v2/organizations',
      logo_url: 'https://unavatar.io/linkedin.com',
      description:
        'Réseau professionnel B2B permettant d’identifier les organigrammes clés (DG, DSI, Directeurs Achats), la répartition des effectifs par fonction et les signaux de croissance interne.',
      enabled: true,
    },
    {
      name: 'APII - Industrie & Innovation',
      type: DataSourceType.OFFICIAL_REGISTRY,
      collection_method: CollectionMethod.CRAWLING,
      configuration_reference: 'http://www.tunisieindustrie.nat.tn',
      logo_url: 'https://www.apiiconcours.tn/assets/img/api.png',
      description:
        'Base officielle de l’Agence de Promotion de l’Industrie répertoriant les sites industriels, unités de production, régimes d’exportation totale et agréments d’investissement en Tunisie.',
      enabled: true,
    },
    {
      name: 'Kompass B2B Tunisie',
      type: DataSourceType.BUSINESS_DIRECTORY,
      collection_method: CollectionMethod.IMPORT,
      configuration_reference: 'https://tn.kompass.com',
      logo_url:
        'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://kompass.com&size=128',
      description:
        'Annuaire sectoriel international B2B indexant les fabricants, importateurs et distributeurs avec nomenclatures de produits Kompass, certifications de qualité et volumes de vente estimés.',
      enabled: true,
    },
    {
      name: 'Keejob Emploi & Recrutement',
      type: DataSourceType.JOB_PLATFORM,
      collection_method: CollectionMethod.CRAWLING,
      configuration_reference: 'https://www.keejob.com/recruteurs',
      logo_url: 'https://www.keejob.com/static/v3/img/logo_keejob_light.png',
      description:
        'Plateforme d’emploi tunisienne exploitée pour la détection de signaux faibles : recrutements intensifs, créations de postes tech/commerciaux et indicateurs de forte croissance.',
      enabled: true,
    },
    {
      name: 'Crawler Web Direct DME',
      type: DataSourceType.COMPANY_WEBSITE,
      collection_method: CollectionMethod.CRAWLING,
      configuration_reference: 'https://spider.dme.orange.tn/crawlers/v2',
      logo_url: '/data-sources.svg',
      description:
        'Moteur de crawling interne DME analysant les sites web institutionnels tunisiens pour extraire les formulaires de contact, mentions légales, technologies web et emails professionnels.',
      enabled: true,
    },
  ];

  let synced = 0;
  for (const source of sources) {
    await prisma.dataSource.upsert({
      where: { name: source.name },
      update: {
        type: source.type,
        collection_method: source.collection_method,
        configuration_reference: source.configuration_reference,
        logo_url: source.logo_url,
        description: source.description,
        enabled: source.enabled,
      },
      create: {
        ...source,
        created_by_id: superadmin.id,
      },
    });
    synced++;
  }

  console.log(`Data sources seed completed: ${synced} sources synced.`);
}
