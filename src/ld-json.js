// Beersheep Beer Store: a shop, not a bar — products in an offer catalog, no menu.
// Opening hours are intentionally left out.
function storeLdJson(sections, t, base, localize) {
    const pageUrl = `https://menu.beersheep.rs${base}/store/`;
    const store = {
        "@context": "https://schema.org",
        "@type": "LiquorStore",
        "@id": "#beersheep-beer-store",
        "name": "Beersheep Beer Store",
        "url": pageUrl,
        "description": t('ld.storeDescription'),
        "logo": "https://menu.beersheep.rs/logo.png",
        "image": "https://menu.beersheep.rs/logo.png",
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

/**
 * Garden drinks page: the bar with a Menu of the mapped drink sections (mapDrinkSections).
 * Whisky regions are nested MenuSections. A price with a volume (bottled soft drinks) or a
 * section serving size (spirits) gets a UnitPriceSpecification for that quantity; anything
 * else (tea, coffee) is a plain per-serving price. Item @ids use the section and position, since
 * names on /sr/ can be Cyrillic and would sanitize to nothing.
 */
function drinksMenu(sections, t) {
    const menuItem = (item, idPrefix, servingMl) => {
        const offers = { "@type": "Offer", "priceCurrency": "RSD" };
        const quantified = item.prices.filter((p) => p.volume_ml || servingMl);
        if (quantified.length > 0) {
            offers.priceSpecification = item.prices.map(({ volume_ml, price }) => ({
                "@type": "UnitPriceSpecification",
                "price": price,
                "priceCurrency": "RSD",
                "referenceQuantity": { "@type": "QuantitativeValue", "value": (volume_ml || servingMl) / 1000, "unitCode": "LTR" }
            }));
        } else if (item.prices.length > 0) {
            offers.price = item.prices[0].price;
        }
        const menuItem = { "@type": "MenuItem", "@id": idPrefix, "name": item.name, "offers": offers };
        if (item.note) menuItem.description = item.note;
        return menuItem;
    };
    return {
        "@type": "Menu",
        "@id": "#drinks-menu",
        "name": t('ld.drinksMenuName'),
        "description": t('ld.drinksMenuDesc'),
        "hasMenuSection": sections.map((section) => {
            const id = `#drinks-${section.name}`;
            const menuSection = { "@type": "MenuSection", "@id": id, "name": section.title };
            if (section.items.length > 0) {
                menuSection.hasMenuItem = section.items.map((item, i) => menuItem(item, `${id}-${i + 1}`, section.serving_ml));
            }
            if (section.groups.length > 0) {
                menuSection.hasMenuSection = section.groups.map((group, g) => ({
                    "@type": "MenuSection",
                    "@id": `${id}-group-${g + 1}`,
                    "name": group.title,
                    "hasMenuItem": group.items.map((item, i) => menuItem(item, `${id}-${g + 1}-${i + 1}`, section.serving_ml))
                }));
            }
            return menuSection;
        })
    };
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
        "logo": "https://menu.beersheep.rs/logo.png",
        "image": "https://menu.beersheep.rs/logo.png",
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
        const props = [];
        if (beer.abv != null) {
            props.push({ "@type": "PropertyValue", "name": "ABV", "value": `${beer.abv}%` });
        }
        if (beer.ibu != null) {
            props.push({ "@type": "PropertyValue", "name": "IBU", "value": String(beer.ibu) });
        }
        const offers = {
            "@type": "Offer",
            "priceCurrency": "RSD"
        };
        if (beer.prices && beer.prices.length > 0) {
            offers.priceSpecification = beer.prices.map(({ volume_ml, price }) => ({
                "@type": "UnitPriceSpecification",
                "price": price,
                "unitCode": "LTR",
                "referenceQuantity": { "@type": "QuantitativeValue", "value": volume_ml / 1000, "unitCode": "LTR" }
            }));
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

    if (pageType === 'drinks') {
        if (data.length > 0) bar.hasMenu = drinksMenu(data, t);
    } else if (pageType === 'bottles') {
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
