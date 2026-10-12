const addressLine = 'Avenida República do Líbano, 23º andar';
const addressDisplay = `${addressLine}, Recife, Pernambuco, Brasil`;

export const companyContact = {
  addressLine,
  addressDisplay,
  city: 'Recife',
  region: 'Pernambuco',
  regionCode: 'PE',
  countryCode: 'BR',
  phoneDisplay: '+55 (81) 99301-5532',
  phoneHref: '+5581993015532',
  whatsappHref: 'https://wa.me/5581993015532',
  email: 'contato@impersonnel.com.br',
  mapsHref: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressDisplay)}`,
} as const;
