module.exports = function (beers) {
    const bar = {
        "@context": "https://schema.org",
        "@type": "BarOrPub",
        "@id": "#beersheep",
        "name": "Beersheep Garden",
        "url": "https://menu.beersheep.rs/",
        "description": "Craft beer bar in Vračar, Belgrade with a rotating tap list of local and imported beers.",
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
            "https://www.instagram.com/beersheep_/",
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

    if (beers.length > 0) {
        bar.servesCuisine = ["Beer"];
        bar.hasMenu = {
            "@type": "Menu",
            "@id": "#menu",
            "name": "Taplist",
            "description": "Beers on tap",
            "hasMenuSection": [{
                "@type": "MenuSection",
                "@id": "#draft-beers",
                "name": "Draft Beers",
                "description": "Current beers on tap",
                "hasMenuItem": beers.map(beer => {
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
                        offers.priceSpecification = Object.entries(beer.prices).map(([volume, price]) => ({
                            "@type": "UnitPriceSpecification",
                            "price": price,
                            "unitCode": "LTR",
                            "referenceQuantity": { "@type": "QuantitativeValue", "value": parseFloat(volume), "unitCode": "LTR" }
                        }));
                    }
                    return {
                        "@type": "MenuItem",
                        "@id": `#tap${beer.tap_num}`,
                        "name": beer.name,
                        "description": beer.description,
                        "additionalProperty": props,
                        "offers": offers
                    };
                })
            }]
        };
    }

    const webSite = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": "#website",
        "url": "https://menu.beersheep.rs/",
        "name": "Beersheep Garden Taplist"
    };

    return [bar, webSite];
};
