const { rdb } = require('../../util/admin');
const clientCheck = require('../../util/clientCheck');
const { validateNewLoanApplication } = require('../../util/validators');

exports.newLoanApplication = (request, response) => {
    if(!request.user.userRoles.sysAdmin){
        if(!clientCheck(request.body.clientId, request.user.user_id)) {
            return response.status(403).json({error: 'Unauthorized operation'});
        }
    }

    const newApplication = {
        clientId: request.body.clientId,
        amount: request.body.amount,
        term: request.body.term,
        propertyArea: request.body.propertyArea
    }
    const { valid, errors } = validateNewLoanApplication(newApplication);
    if (!valid) return response.status(400).json(errors);

    newApplication.createdDate = new Date().toISOString();
    const applicationRef = rdb.ref('/loanApplications');
    const newApplicationRef = applicationRef.push();
    newApplicationRef
        .set(newApplication)
        .then(()=>{
            let key = newApplicationRef.key;
            return response.status(201).json({key});
        }).catch((error) => {
        console.log(error);
        response.status(500).json({ error });
    });
}

exports.getLoanApplicationById = async (request, response) => {
    const apID = request.params.apID;
    const applicationRef = rdb.ref(`/loanApplications/${apID}`);
    const snapshot = await applicationRef.once("value");
    let application = snapshot.val();

    if(!request.user.userRoles.sysAdmin){
        if(!clientCheck(application.clientId, request.user.user_id)) {
            return response.status(403).json({error: 'Unauthorized operation'});
        }
    }
    return response.status(201).json({application});
}

exports.getLoanApplicationByClient = async (request, response) => {
    const clID = request.params.clID;

    if(!request.user.userRoles.sysAdmin){
        if(!clientCheck(clID, request.user.user_id)) {
            return response.status(403).json({error: 'Unauthorized operation'});
        }
    }

    const applicationRef = rdb.ref('/loanApplications');
    const query = applicationRef.orderByChild("clientId").equalTo(clID);
    const snapshot = await query.once('value');
    let applications = ( snapshot.val() || {} );

    return response.status(201).json({applications});
}

exports.updateLoanApplicationById = async (request, response) => {
    const apID = request.params.apID;

    if(!request.user.userRoles.sysAdmin){
        if(!clientCheck(request.body.clientId, request.user.user_id)) {
            return response.status(403).json({error: 'Unauthorized operation'});
        }
    }

    const updateApplication = {
        amount: request.body.amount,
        term: request.body.term,
        propertyArea: request.body.propertyArea
    }
    console.log(apID);
    const apRef = rdb.ref(`/loanApplications/${apID}`);
    apRef.update(updateApplication)
        .then(() => {
            return response.json({message: 'Updated successfully'});
        })
        .catch((error) => {
            return response.status(500).json({
                message: "Cannot Update the value"
            });
        });
}

exports.uploadModel = async (request, response) => {
    console.log("Uploading loan applications");
    if(!request.user.userRoles.sysAdmin){
        return response.status(403).json({ error: 'Unauthorized operation' });
    }
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');
    const busboy = new BusBoy({ headers: request.headers });

    let modelToBeUploaded = {};
    let weightsToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        console.log("Busboy On")
        if (fieldname === 'modelFile'){
            if( mimetype !== 'application/json') {
                return response.status(400).json({ error: 'Model file is not in JSON format' });
            }
            const filePath = path.join(os.tmpdir(), filename);
            modelToBeUploaded = { filePath, mimetype };
            file.pipe(fs.createWriteStream(filePath));
        } else if (fieldname === 'weightsFile'){
            if( mimetype !== 'application/octet-stream') {
                return response.status(400).json({ error: 'Weights file is not in .bin format' });
            }
            const filePath = path.join(os.tmpdir(), filename);
            weightsToBeUploaded = { filePath, mimetype, filename };
            file.pipe(fs.createWriteStream(filePath));
        }
    });

    busboy.on('finish', async () => {
        if(!modelToBeUploaded.filePath || !weightsToBeUploaded.filePath){
            return response.status(400).json({ error: 'Both files must be uploaded' });
        }
        const directory = './AI_Models/Loan_Approval';
        try {
            //Remove existing files
            await fs.readdir(directory,{}, (err, files) => {
                if (err) throw err;
                files.forEach((file) => {
                    fs.unlinkSync(`${directory}/${file}`);
                })
            });

            await fs.rename(modelToBeUploaded.filePath, `${directory}/model.json`, (err) => {
                if (err) throw err;
            });
            await fs.rename(weightsToBeUploaded.filePath, `${directory}/${weightsToBeUploaded.filename}`, (err) => {
                if (err) throw err;
            });
            return response.json({ message: 'Uploaded successfully' });
        } catch (err) {
            return response.status(500).json({
                message: e
            });
        }

    });

    busboy.end(request.rawBody);
}