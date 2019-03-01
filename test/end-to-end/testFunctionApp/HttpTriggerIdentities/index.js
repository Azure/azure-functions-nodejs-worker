module.exports = async function (context, req) {
    if (req.user && req.user.length > 0) {
        var identity = req.user[0];
        let nameClaim, idClaim;
        if (identity.claims) {
            nameClaim = getClaimByType(identity.claims, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");
            idClaim = getClaimByType(identity.claims, "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier");
        }

        context.res = {
            // status: 200, /* Defaults to 200 */
            body: `${identity.authenticationType}, ${nameClaim.value}, ${idClaim.value}`,
        };
    }
    else {
        context.res = {
            status: 400,
            body: "No user object."
        };
    }
};

function getClaimByType(claims, type) {
    if (claims) {
        const filterResult = claims.filter(c => c.type === type);
        return filterResult.length > 0
            ? filterResult[0]
            : undefined;        
    }
}