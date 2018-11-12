module.exports = async function (context, documents) {
    context.log.info("JavaScript Cosmos DB trigger function executed. Received document: " + documents);
    if (!!documents && documents.length > 0) {
        var document = documents[0]
        context.log('Document Id: ', document.id);
        document.Description = "testdescription";
        return document;
    }
}
