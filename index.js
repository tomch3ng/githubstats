var graphqlReq = require('graphql-request');
const jsonfile = require('jsonfile');

var ghToken = process.env.GITHUB_API_KEY;

var mode = "dependencies";
if (process.argv.length > 2) mode = process.argv[2];

const client = new graphqlReq.GraphQLClient('https://api.github.com/graphql', {
    headers: {
        Authorization: 'Bearer ' + ghToken,
        Accept: 'application/vnd.github.hawkgirl-preview+json'
    },
})

var repoFilterExpr = /atom/i;
const repoJson = 'data/repos.json'

const repoQuery = `
query getRepos ($cursor: String){
    organization(login: "KaplanTestPrep") {
      repositories(orderBy: {field: NAME, direction: ASC}, first: 20, after: $cursor) {
        pageInfo {
          endCursor
          startCursor
          hasNextPage
          hasPreviousPage
        }
        nodes {
          name,
          description,
          createdAt,
          pushedAt,
          updatedAt,
          dependencyGraphManifests(first:100) {
            totalCount
          }
        }
      }
    }
  }
  
`;

if (mode == "repos") getRepos()
// else if (mode == "dependencies") getDependencies();



function getRepos(cursor = "") {
    const variables = {
        cursor: cursor
    }
    console.log("Name,Description,CreatedAt,PushedAt,UpdatedAt,DependencyManifests")
    client.request(repoQuery, variables).then(data => {
        var repos = data.organization.repositories;

        for (var i in repos.nodes) {
            var repo = repos.nodes[i];
            if (repoFilterExpr.test(repo.name)) {
                console.log(repo.name+",\""+repo.description+"\","+repo.createdAt+","+repo.pushedAt+","+repo.updatedAt+","+repo.dependencyGraphManifests.totalCount)
                // getDependencies("KaplanTestPrep", repo.name, cursor = "")
            }
        }
        cursor = repos.pageInfo.endCursor;
        var hasNextPage = repos.pageInfo.hasNextPage;
        if (hasNextPage) getRepos(cursor);
    }).catch(err => {
        console.log(err.response.errors) // GraphQL response errors
        console.log(err.response.data) // Response data if available    
    })}

const dependencyQuery = `query getDependencies ($repoowner: String!, $reponame: String!, $cursor: String!){
    repository(owner: $repoowner, name: $reponame) {
        dependencyGraphManifests(first:100) {
        totalCount,
        pageInfo{endCursor,hasNextPage,hasPreviousPage}
        nodes {
            filename,
            dependenciesCount,
            dependencies(first: 100, after: $cursor) {
            totalCount
            pageInfo {
                endCursor
                hasNextPage
                hasPreviousPage
            }
            nodes {
                hasDependencies
                packageManager
                packageName
                requirements
            }
            }
        }
        }
    }
}
`

function getDependencies(repoOwner, repoName, cursor = "") {
    var hasNextPage = false;
    const variables = {
        repoowner: repoOwner,
        reponame: repoName,
        cursor: cursor
    }
    client.request(dependencyQuery, variables).then(data => {
        var manifests = data.repository.dependencyGraphManifests.nodes;

        for (var i in manifests) {
            var manifest = manifests[i];

            var dependencies = manifest.dependencies;
            for (var j in dependencies.nodes) {
                var dependency = dependencies.nodes[j];
                console.log([repoName, manifest.filename, dependency.packageManager, dependency.packageName, dependency.requirements].join(","))
            }
            cursor = dependencies.pageInfo.endCursor;
            hasNextPage = dependencies.pageInfo.hasNextPage || hasNextPage;
        }
        if (hasNextPage) getDependencies(repoOwner, repoName, cursor);
    }).catch(err => {
        console.log(err.response.errors) // GraphQL response errors
        console.log(err.response.data) // Response data if available    
    })
}