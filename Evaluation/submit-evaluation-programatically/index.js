//import { ConnectClient, StartContactEvaluationCommand, SubmitContactEvaluationCommand } from '@aws-sdk/client-connect';
import { ConnectClient, StartContactEvaluationCommand, SubmitContactEvaluationCommand, DescribeContactCommand } from '@aws-sdk/client-connect';

const client = new ConnectClient({ region: process.env.AWS_REGION || 'us-east-1' });

//Replace "xxxx" with values from your Amazon Connect instance
const INSTANCE_ID = process.env.INSTANCE_ID || 'xxxx';
const EVALUATION_FORM_ID = process.env.EVALUATION_FORM_ID || 'xxxx';
const USER_ARN = process.env.USER_ARN || 'xxxx';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const handler = async (event) => {
    const contactId = event.Details.ContactData.ContactId;

    try {
        // Wait for contact to end (poll with timeout)
        console.log('Waiting for contact to end:', contactId);
        const maxWaitTime = 300000; // 5 minutes
        const pollInterval = 5000; // 5 seconds
        let elapsed = 0;
        let contactEnded = false;

        while (elapsed < maxWaitTime && !contactEnded) {
            await sleep(pollInterval);
            elapsed += pollInterval;

            const describeCommand = new DescribeContactCommand({
                InstanceId: INSTANCE_ID,
                ContactId: contactId
            });

            const contactInfo = await client.send(describeCommand);
            const disconnectTimestamp = contactInfo.Contact?.DisconnectTimestamp;

            if (disconnectTimestamp) {
                contactEnded = true;
                console.log('Contact ended at:', disconnectTimestamp);
                // Wait additional 10 seconds for data to propagate
                await sleep(10000);
            }
        }

        if (!contactEnded) {
            return {
                statusCode: 408,
                message: 'Timeout waiting for contact to end'
            };
        }
        // Step 1: Start evaluation
        const startCommand = new StartContactEvaluationCommand({
            InstanceId: INSTANCE_ID,
            ContactId: contactId,
            EvaluationFormId: EVALUATION_FORM_ID
        });

        const startResponse = await client.send(startCommand);
        const evaluationId = startResponse.EvaluationId;
        console.log('Evaluation started:', evaluationId);
        console.log('Full start response:', JSON.stringify(startResponse, null, 2));

        // Step 2: Submit evaluation
        const submitCommand = new SubmitContactEvaluationCommand({
            InstanceId: INSTANCE_ID,
            EvaluationId: evaluationId,
            Answers: {
                // Section: Call Quality
                'q9345a455': {  // Did the agent greet the customer
                    Value: {
                        //StringValue: 'o86488603'  // Yes
                        //SelectedOptionRefId: 'o86488603'  // Yes
                        //StringValue: 'o86488603'
                        StringValue: 'Yes'
                    }
                },
                'q4d82f393': {  // Was the agent polite during the call (-5 to 5)
                    Value: {
                        NumericValue: 4
                    }
                },
                // Section: Transaction Quality
                'q7fa884c4': {  // Did the agent acknowledge customer's problem
                    Value: {
                        //StringValue: 'o37f108c1'  // Yes
                        //SelectedOptionRefId: 'o37f108c1'  // Yes
                        //StringValue: 'o37f108c1'
                        StringValue: 'Yes'
                    }
                },
                'q60e41709': {  // Was the customer satisfied with resolution (-5 to 5)
                    Value: {
                        NumericValue: 3
                    }
                }
            },
            Notes: {
                'q9345a455': {
                    Value: 'Agent greeted professionally'
                },
                'q7fa884c4': {
                    Value: 'Agent showed good understanding'
                }
            },
            SubmittedBy: {
                ConnectUserArn: USER_ARN
            }
        });

        const submitResponse = await client.send(submitCommand);
        console.log('Evaluation submitted:', submitResponse.EvaluationId);

        return {
            statusCode: 200,
            evaluationId: submitResponse.EvaluationId
        };
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Full error:', JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            error: error.message,
            stack: error.stack
        };
    }
};