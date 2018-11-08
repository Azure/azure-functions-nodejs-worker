// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;
using System.Threading.Tasks;
using Microsoft.Azure.Documents;
using Microsoft.Azure.Documents.Client;

namespace Azure.Functions.Java.Tests.E2E
{
    public class TestDocument
    {
        public string id { get; set; }
        public string name { get; set; }
    }

    public static class CosmosDBHelpers
    {
        private static DocumentClient _docDbClient;
        private static Uri inputCollectionsUri = UriFactory.CreateDocumentCollectionUri(Constants.DocDbDatabaseName, Constants.InputDocDbCollectionName);
        private static Uri outputCollectionsUri = UriFactory.CreateDocumentCollectionUri(Constants.DocDbDatabaseName, Constants.OutputDocDbCollectionName);
        private static Uri leasesCollectionsUri = UriFactory.CreateDocumentCollectionUri(Constants.DocDbDatabaseName, Constants.DocDbLeaseCollectionName);

        static CosmosDBHelpers()
        {
            var builder = new System.Data.Common.DbConnectionStringBuilder();
            builder.ConnectionString = Constants.CosmosDBConnectionStringSetting;
            var serviceUri = new Uri(builder["AccountEndpoint"].ToString());
            _docDbClient = new DocumentClient(serviceUri, builder["AccountKey"].ToString());
        }

        // keep
        public async static Task CreateDocument(string docId)
        {
            Document documentToTest = new Document()
            {
                Id = docId
            };

            Document insertedDoc = await _docDbClient.CreateDocumentAsync(UriFactory.CreateDocumentCollectionUri(Constants.DocDbDatabaseName, Constants.InputDocDbCollectionName), documentToTest);
        }

        public async static Task CreateDocument(TestDocument testDocument)
        {
            Document insertedDoc = await _docDbClient.CreateDocumentAsync(UriFactory.CreateDocumentCollectionUri(Constants.DocDbDatabaseName, Constants.InputDocDbCollectionName), testDocument);
        }

        // keep
        public async static Task<string> ReadDocument(string docId)
        {
            var docUri = UriFactory.CreateDocumentUri(Constants.DocDbDatabaseName, Constants.OutputDocDbCollectionName, docId);
            Document retrievedDocument = null;
            await Utilities.RetryAsync(async () =>
            {
                try
                {
                    retrievedDocument = await _docDbClient.ReadDocumentAsync(docUri);
                    return true;
                }
                catch (DocumentClientException ex) when (ex.Error.Code == "NotFound")
                {
                    return false;
                }
            }, 120000, 4000);
            return retrievedDocument.Id;
        }

        // keep
        public async static Task DeleteTestDocuments(string docId)
        {
            var inputDocUri = UriFactory.CreateDocumentUri(Constants.DocDbDatabaseName, Constants.InputDocDbCollectionName, docId);
            await DeleteDocument(inputDocUri);
            var outputDocUri = UriFactory.CreateDocumentUri(Constants.DocDbDatabaseName, Constants.OutputDocDbCollectionName, docId);
            await DeleteDocument(outputDocUri);
        }

        private async static Task DeleteDocument(Uri docUri)
        {
            try
            {
                await _docDbClient.DeleteDocumentAsync(docUri);
            }
            catch (Exception)
            {
                //ignore
            }
        }

        // keep
        public async static Task CreateDocumentCollections()
        {
            Database db = await _docDbClient.CreateDatabaseIfNotExistsAsync(new Database { Id = Constants.DocDbDatabaseName });
            Uri dbUri = UriFactory.CreateDatabaseUri(db.Id);

            await CreateCollection(dbUri, Constants.InputDocDbCollectionName);
            await CreateCollection(dbUri, Constants.OutputDocDbCollectionName);
            await CreateCollection(dbUri, Constants.DocDbLeaseCollectionName);

        }
        public async static Task DeleteDocumentCollections()
        {
            await DeleteCollection(inputCollectionsUri);
            await DeleteCollection(outputCollectionsUri);
            await DeleteCollection(leasesCollectionsUri);
        }

        private async static Task DeleteCollection(Uri collectionUri)
        {
            try
            {
                await _docDbClient.DeleteDocumentCollectionAsync(collectionUri);
            }
            catch (Exception)
            {
                //Ignore
            }
        }

        private async static Task CreateCollection(Uri dbUri, string collectioName)
        {
            DocumentCollection collection = new DocumentCollection() { Id = collectioName };
            await _docDbClient.CreateDocumentCollectionIfNotExistsAsync(dbUri, collection,
                new RequestOptions()
                {
                    OfferThroughput = 400
                });
        }
    }
}