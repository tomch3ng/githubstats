const graphqlReq = require('graphql-request');
const jsonfile = require('jsonfile');
const nugetStats = require('nuget.getstats');
const pkgstat = require('pkgstat');

var ghToken = process.env.GITHUB_API_KEY;

var mode = "foo";
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

if (mode == "repos") getRepos()
else if (mode == "repodependencies") {
    let repoName = process.argv[3];
    getRepoDependencies(repoName);
} else if (mode == "dependencies") {
    let start = process.argv[3];
    let end = process.argv[4];
    getDependencies(start, end);
}

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

async function getDependencies(start, end) {
    let repos = await jsonfile.readFile(repoJson);
    for (var i = start - 1; (i < end && i < repos.length); i++ ) {
        var repo = repos[i];
        await getRepoDependencies(repo.name);
    }
}

async function getRepoDependencies(repoName) {
    var hasNextPage = true;
    let data = {};
    let cursor = "";

    while (hasNextPage) {
        const variables = {
            repoowner: "KaplanTestPrep",
            reponame: repoName,
            cursor: cursor
        }

        try {
            data = await client.request(dependencyQuery, variables);
            let anyNextPage = false;
    
            var manifests = data.repository.dependencyGraphManifests.nodes;
    
            for (var i in manifests) {
                var manifest = manifests[i];
    
                var dependencies = manifest.dependencies;
                for (var j in dependencies.nodes) {
                    var dependency = dependencies.nodes[j];
                    let pkgDetails = await getPackageDetails(dependency.packageManager, dependency.packageName);
                    console.log([repoName, manifest.filename, dependency.packageManager, dependency.packageName, pkgDetails, dependency.requirements].join(","))
                }
                if (dependencies.pageInfo.hasNextPage) {
                    anyNextPage = dependencies.pageInfo.hasNextPage;
                    cursor = dependencies.pageInfo.endCursor;
    
                }
            }            
            hasNextPage = anyNextPage;
        } catch (err) {
            console.log("Error getting dependencies for %s at cursor %s: %s", repoName, cursor, err);
            hasNextPage = false;
        }
    }
}

async function getPackageDetails(pkgMgr, pkgName) {
    try {
        if (pkgMgr == 'NPM'){
            let pkgDetails = await pkgstat(pkgName, 'node');
            return pkgDetails.license
        } else if (pkgMgr == 'NUGET') {
            let pkgDetails = await nugetStats.GetNugetPackageStats(pkgName);
            return pkgDetails.LicenseUrl;
        } else if (pkgMgr == 'PIP') {
            let pkgDetails = await pkgstat(pkgName, 'python');
            return pkgDetails.license;
        } else if (pkgMgr == 'RUBYGEMS') {
            let pkgDetails = await pkgstat(pkgName, 'ruby');
            return pkgDetails.license;
        }
    } catch (err) {
        console.log("Error getting package details for %s package %s: %s", pkgMgr, pkgName, err);
    }

}