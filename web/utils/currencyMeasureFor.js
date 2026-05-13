function currencyMeasureFor(connector, currencyCode) {
  const measure = {
    EUR: 'dfc-m:Euro',
    GBP: 'dfc-m:PoundSterling',
    USD: 'dfc-m:USDollar',
  }[currencyCode];

  if (!measure) {
    throw new Error(
      `Unknown connector currency mapping for currency code ${currencyCode}`
    );
  }

  return measure;
}

export default currencyMeasureFor;
