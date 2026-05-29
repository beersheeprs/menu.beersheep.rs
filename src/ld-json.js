module.exports = function (beers) {
    const ld = {
        "@context": "https://schema.org",
        "@type": "BarOrPub",
        "@id": "#beersheep",
        "name": "Beersheep Garden",
        "url": "https://menu.beersheep.rs/",
        "logo": "https://menu.beersheep.rs/mstile-310x310.png",
        "image": "https://menu.beersheep.rs/mstile-310x310.png",
        "telephone": "+38163301415",
        "priceRange": "$",
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
        ld.servesCuisine = ["Beer"];
        ld.hasMenu = {
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
                    return {
                        "@type": "MenuItem",
                        "@id": `#tap${beer.tap_num}`,
                        "name": beer.name,
                        "description": beer.description,
                        "additionalProperty": props,
                        "offers": {
                            "@type": "Offer",
                            "priceCurrency": "RSD",
                            "priceSpecification": [
                                {
                                    "@type": "UnitPriceSpecification",
                                    "price": beer.price_small,
                                    "unitCode": "LTR",
                                    "referenceQuantity": { "@type": "QuantitativeValue", "value": 0.33, "unitCode": "LTR" }
                                },
                                {
                                    "@type": "UnitPriceSpecification",
                                    "price": beer.price_big,
                                    "unitCode": "LTR",
                                    "referenceQuantity": { "@type": "QuantitativeValue", "value": 0.5, "unitCode": "LTR" }
                                }
                            ]
                        }
                    };
                })
            }]
        };
    }

    return ld;
};
