/**
 * Sample photos for the demo stores, hotlinked from Unsplash (free to use under the Unsplash licence).
 * Keys are Unsplash CDN photo ids; `photoUrl` adds the crop and size. Real media replaces this map
 * once products carry their own images.
 */

const LARI = {
  shoeRed: '1739138053507-0f312a938451',
  shoeGrey: '1709258228137-19a8c193be39',
  shoeHand: '1562183241-b937e95585b6',
  shoeTrack: '1781601350953-c50fe9471ad4',
  shoeDark: '1770430725086-8b677d6f25a8',
  roadFeet: '1781029103066-9ff7c45eafd0',
  trailLace: '1711466067057-d1bd10183924',
  trailFeet: '1580058572462-98e2c0e0e2f0',
  trailForest: '1789121418155-32c361aeeab9',
  trailPath: '1696964904681-7ae16f82ceef',
  cityRunner: '1776795279350-491ab63f113a',
  cityPair: '1554139844-af2fc8ad3a3a',
  parkPair: '1590335556612-153ed0ad4e68',
  duskRoad: '1522040942177-269680274214',
  raceDuo: '1758684050596-15a238d24202',
  socks: '1773665230184-5fd8cb4fc928',
  raceCrowd: '1760315972424-1637530daead',
  watch: '1587400519568-1fe0329bfb2e',
  supplements: '1687200268313-4b94aad094d4',
  bottle: '1686602397444-03cb5f5f3703',
  protein: '1693996045300-521e9d08cabc',
  sunsetTrack: '1758922769578-68c5ba000d87',
  trackGroup: '1551927336-09d50efd69cd',
}

const ARUNA = {
  serumOil: '1741896135512-084b251887f7',
  serumAmber: '1713768704571-6aeb0d0e5105',
  tube: '1616750819456-5cdee9b85d22',
  tubeLinen: '1620916566398-39f1143ab7be',
  jars: '1764694071508-e4b1efcd39bc',
  toner: '1627811015433-368c148f6c3c',
  powder: '1515688594390-b649af70d282',
  makeupFlat: '1596462502278-27bfdc403348',
  palette: '1512496015851-a90fb38ba796',
  pump: '1747858989102-cca0f4dc4a11',
  dropperStone: '1696025522422-aa9a74e4f3d5',
  perfumeFloral: '1615108395437-df128ad79e80',
  perfumeAmber: '1588405748880-12d1d2a59f75',
  routineFlat: '1598440947619-2c35fc9aa908',
  giftBox: '1759563871375-d5b140f6646e',
  faceCare: '1670201203208-055d6d79db4a',
  jarRoses: '1765964492963-b0aa8c172431',
  faceTouch: '1670201203116-26644750a726',
  shelfie: '1612817288484-6f916006741a',
  perfumePink: '1595425959632-34f2822322ce',
}

const TEKNIKA = {
  machiningCenter: '1740209475472-aa7d280f7452',
  lathe: '1666634157070-6fd830fb5672',
  cncCell: '1717386255773-a456c611dc4e',
  compressor: '1787939060968-2a385b670fa1',
  bluePlant: '1637296001304-4a098990b084',
  filterHousing: '1563456019498-843e11bdaae0',
  machining: '1666618090858-fbcee636bd3e',
  motor: '1649262756591-9243702d33d1',
  spindle: '1713371398484-cc4e4f6a262a',
  controlPanel: '1748348077944-3d9be77b9940',
  technician: '1632914146475-bfe6fa6b2a12',
  engineer: '1528953030358-b0c7de371f1f',
  oilPour: '1621958180509-74e9a29b3758',
  oilSwirl: '1709293078197-370c804d610c',
}

/** One photo per product id. Products in the same family may share a shot. */
const PRODUCT_PHOTOS: Record<string, string> = {
  'prd-lr-101': LARI.shoeRed,
  'prd-lr-102': LARI.shoeGrey,
  'prd-lr-103': LARI.shoeHand,
  'prd-lr-104': LARI.shoeTrack,
  'prd-lr-105': LARI.shoeDark,
  'prd-lr-106': LARI.roadFeet,
  'prd-lr-107': LARI.trailLace,
  'prd-lr-108': LARI.trailFeet,
  'prd-lr-109': LARI.trailForest,
  'prd-lr-110': LARI.cityRunner,
  'prd-lr-111': LARI.parkPair,
  'prd-lr-112': LARI.duskRoad,
  'prd-lr-113': LARI.cityPair,
  'prd-lr-114': LARI.raceDuo,
  'prd-lr-115': LARI.socks,
  'prd-lr-116': LARI.sunsetTrack,
  'prd-lr-117': LARI.trailPath,
  'prd-lr-118': LARI.raceCrowd,
  'prd-lr-119': LARI.watch,
  'prd-lr-120': LARI.bottle,
  'prd-lr-121': LARI.supplements,
  'prd-lr-122': LARI.protein,
  'prd-lr-123': LARI.parkPair,
  'prd-lr-124': LARI.roadFeet,
  'prd-lr-125': LARI.raceDuo,
  'prd-lr-126': LARI.raceCrowd,
  'prd-lr-127': LARI.shoeRed,
  'prd-lr-128': LARI.trackGroup,
  'prd-lr-129': LARI.shoeDark,
  'prd-lr-130': LARI.duskRoad,
  'prd-ar-101': ARUNA.serumOil,
  'prd-ar-102': ARUNA.serumAmber,
  'prd-ar-103': ARUNA.tube,
  'prd-ar-104': ARUNA.tubeLinen,
  'prd-ar-105': ARUNA.jarRoses,
  'prd-ar-106': ARUNA.toner,
  'prd-ar-107': ARUNA.jars,
  'prd-ar-108': ARUNA.makeupFlat,
  'prd-ar-109': ARUNA.powder,
  'prd-ar-110': ARUNA.palette,
  'prd-ar-111': ARUNA.faceTouch,
  'prd-ar-112': ARUNA.makeupFlat,
  'prd-ar-113': ARUNA.pump,
  'prd-ar-114': ARUNA.dropperStone,
  'prd-ar-115': ARUNA.perfumeFloral,
  'prd-ar-116': ARUNA.perfumeAmber,
  'prd-ar-117': ARUNA.routineFlat,
  'prd-ar-118': ARUNA.giftBox,
  'prd-ar-119': ARUNA.faceCare,
  'prd-ar-120': ARUNA.shelfie,
  'prd-ar-121': ARUNA.tubeLinen,
  'prd-tk-101': TEKNIKA.machiningCenter,
  'prd-tk-102': TEKNIKA.lathe,
  'prd-tk-103': TEKNIKA.cncCell,
  'prd-tk-104': TEKNIKA.compressor,
  'prd-tk-105': TEKNIKA.bluePlant,
  'prd-tk-106': TEKNIKA.filterHousing,
  'prd-tk-107': TEKNIKA.motor,
  'prd-tk-108': TEKNIKA.oilPour,
  'prd-tk-109': TEKNIKA.oilSwirl,
  'prd-tk-110': TEKNIKA.spindle,
  'prd-tk-111': TEKNIKA.controlPanel,
  'prd-tk-112': TEKNIKA.technician,
}

const CATEGORY_PHOTOS: Record<string, string> = {
  'cat-lari-shoes': LARI.shoeRed,
  'cat-lari-road': LARI.roadFeet,
  'cat-lari-trail': LARI.trailPath,
  'cat-lari-apparel': LARI.raceDuo,
  'cat-lari-acc': LARI.watch,
  'cat-lari-nutri': LARI.supplements,
  'cat-lari-coach': LARI.raceCrowd,
  'cat-aruna-face': ARUNA.faceTouch,
  'cat-aruna-skin': ARUNA.shelfie,
  'cat-aruna-makeup': ARUNA.palette,
  'cat-aruna-hair': ARUNA.dropperStone,
  'cat-aruna-frag': ARUNA.perfumePink,
  'cat-aruna-sets': ARUNA.giftBox,
  'cat-tek-machines': TEKNIKA.cncCell,
  'cat-tek-cnc': TEKNIKA.machiningCenter,
  'cat-tek-air': TEKNIKA.compressor,
  'cat-tek-parts': TEKNIKA.filterHousing,
  'cat-tek-service': TEKNIKA.controlPanel,
}

/** Lifestyle shots per tenant: the home banner, the brand story, and customer posts. */
const TENANT_PHOTOS: Record<string, { hero: string; story: string; posts: string[] }> = {
  'ten-lari': {
    hero: LARI.sunsetTrack,
    story: LARI.raceDuo,
    posts: [LARI.parkPair, LARI.trailForest, LARI.cityRunner, LARI.raceCrowd, LARI.duskRoad, LARI.trackGroup],
  },
  'ten-aruna': {
    hero: ARUNA.faceTouch,
    story: ARUNA.faceCare,
    posts: [
      ARUNA.faceCare,
      ARUNA.shelfie,
      ARUNA.routineFlat,
      ARUNA.makeupFlat,
      ARUNA.perfumePink,
      ARUNA.jarRoses,
    ],
  },
  'ten-teknika': {
    hero: TEKNIKA.machiningCenter,
    story: TEKNIKA.engineer,
    posts: [
      TEKNIKA.machining,
      TEKNIKA.cncCell,
      TEKNIKA.compressor,
      TEKNIKA.spindle,
      TEKNIKA.lathe,
      TEKNIKA.motor,
    ],
  },
}

/** CDN url for a photo id, cropped to `width` and an optional aspect (height = width × ratio). */
export function photoUrl(id: string, width: number, ratio = 1): string {
  const h = Math.round(width * ratio)
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&h=${h}&q=70`
}

export const productPhoto = (productId: string): string | undefined => PRODUCT_PHOTOS[productId]
export const categoryPhoto = (categoryId: string): string | undefined => CATEGORY_PHOTOS[categoryId]
export const tenantPhotos = (tenantId: string) => TENANT_PHOTOS[tenantId]
