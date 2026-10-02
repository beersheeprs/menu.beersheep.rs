// Beersheep Beer Store: a shop, not a bar — products in an offer catalog, no menu.
// Opening hours are intentionally left out.
function storeLdJson(sections, t, base, localize) {
    const pageUrl = `https://menu.beersheep.rs${base}/store.html`;
    const store = {
        "@context": "https://schema.org",
        "@type": "LiquorStore",
        "@id": "#beersheep-beer-store",
        "name": "Beersheep Beer Store",
        "url": pageUrl,
        "description": t('ld.storeDescription'),
        "logo": "https://menu.beersheep.rs/mstile-310x310.png",
        "image": "https://menu.beersheep.rs/mstile-310x310.png",
        "telephone": "+38163301415",
        "areaServed": { "@type": "City", "name": "Belgrade" },
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Balkanska 21",
            "addressLocality": "Belgrade",
            "addressCountry": "RS"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": "44.8111801",
            "longitude": "20.4603043"
        },
        "sameAs": [
            "https://t.me/Beersheep",
            "https://www.instagram.com/beersheep_/",
            "https://www.facebook.com/BeerSheep1/"
        ]
    };

    if (sections.length > 0) {
        store.hasOfferCatalog = {
            "@type": "OfferCatalog",
            "name": t('ld.storeCatalogName'),
            "itemListElement": sections.map(section => ({
                "@type": "OfferCatalog",
                "name": localize.country(section.name),
                "itemListElement": section.beers.map(beer => {
                    const product = {
                        "@type": "Product",
                        "name": beer.name,
                        "category": beer.style
                    };
                    const description = localize.description(beer);
                    if (description) product.description = description;
                    if (beer.brewery) product.brand = { "@type": "Brand", "name": beer.brewery };
                    if (beer.abv != null) {
                        product.additionalProperty = [{ "@type": "PropertyValue", "name": "ABV", "value": `${beer.abv}%` }];
                    }
                    return { "@type": "Offer", "itemOffered": product };
                })
            }))
        };
    }

    const webSite = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": "#website",
        "url": pageUrl,
        "inLanguage": t('meta.lang'),
        "name": "Beersheep Beer Store"
    };

    return [store, webSite];
}

module.exports = function (data, pageType, t, base, localize) {
    if (pageType === 'store') return storeLdJson(data, t, base, localize);

    const pageUrl = `https://menu.beersheep.rs${base}/`;

    const bar = {
        "@context": "https://schema.org",
        "@type": "BarOrPub",
        "@id": "#beersheep",
        "name": "Beersheep Garden",
        "url": pageUrl,
        "description": t('ld.barDescription'),
        "logo": "https://menu.beersheep.rs/mstile-310x310.png",
        "image": "https://menu.beersheep.rs/mstile-310x310.png",
        "telephone": "+38163301415",
        "priceRange": "$",
        "areaServed": { "@type": "City", "name": "Belgrade" },
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Kneginje Zorke 3",
            "addressLocality": "Belgrade",
            "postalCode": "11000",
            "addressCountry": "RS"
        },
        "hasMap": "https://maps.app.goo.gl/z2qo5YZfdFaiDu4n7",
        "sameAs": [
            "https://t.me/Beersheep",
            "https://www.instagram.com/beersheepgarden/",
            "https://www.facebook.com/BeerSheep1/"
        ],
        "openingHoursSpecification": [
            { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday"], "opens": "16:00", "closes": "00:00" },
            { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Friday", "Saturday"], "opens": "16:00", "closes": "01:00" },
            { "@type": "OpeningHoursSpecification", "dayOfWeek": "Sunday", "opens": "15:00", "closes": "23:00" }
        ],
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": "44.8002398",
            "longitude": "20.4665677"
        }
    };

    function makeMenuItem(beer, idPrefix) {
        const props = [
            { "@type": "PropertyValue", "name": "ABV", "value": `${beer.abv}%` }
        ];
        if (beer.ibu != null) {
            props.push({ "@type": "PropertyValue", "name": "IBU", "value": String(beer.ibu) });
        }
        const offers = {
            "@type": "Offer",
            "priceCurrency": "RSD"
        };
        if (beer.prices) {
            offers.priceSpecification = Object.entries(beer.prices).map(([volume, price]) => {
                const v = parseFloat(volume);
                const liters = v >= 1 ? v / 1000 : v;
                return {
                    "@type": "UnitPriceSpecification",
                    "price": price,
                    "unitCode": "LTR",
                    "referenceQuantity": { "@type": "QuantitativeValue", "value": liters, "unitCode": "LTR" }
                };
            });
        }
        return {
            "@type": "MenuItem",
            "@id": `#${idPrefix}${beer.tap_num || beer.name.replace(/[^a-zA-Z0-9]/g, '')}`,
            "name": beer.name,
            "description": localize.description(beer),
            "additionalProperty": props,
            "offers": offers
        };
    }

    if (pageType === 'bottles') {
        if (data.length > 0) {
            bar.servesCuisine = ["Beer"];
            bar.hasMenu = {
                "@type": "Menu",
                "@id": "#menu",
                "name": t('ld.bottleMenuName'),
                "description": t('ld.bottleMenuDesc'),
                "hasMenuSection": data.map(section => ({
                    "@type": "MenuSection",
                    "@id": `#section-${section.name.replace(/[^a-zA-Z0-9]/g, '')}`,
                    "name": section.name,
                    "hasMenuItem": section.beers.map(beer => makeMenuItem(beer, 'bottle-'))
                }))
            };
        }
    } else {
        if (data.length > 0) {
            bar.servesCuisine = ["Beer"];
            bar.hasMenu = {
                "@type": "Menu",
                "@id": "#menu",
                "name": t('ld.tapMenuName'),
                "description": t('ld.tapMenuDesc'),
                "hasMenuSection": [{
                    "@type": "MenuSection",
                    "@id": "#draft-beers",
                    "name": t('ld.draftSection'),
                    "description": t('ld.draftSectionDesc'),
                    "hasMenuItem": data.map(beer => makeMenuItem(beer, 'tap'))
                }]
            };
        }
    }

    const webSite = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": "#website",
        "url": pageUrl,
        "inLanguage": t('meta.lang'),
        "name": t('meta.siteName')
    };

    return [bar, webSite];
};
