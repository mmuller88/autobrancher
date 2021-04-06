import { App, Construct, Duration, Stack, StackProps } from '@aws-cdk/core';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import * as path from 'path';
import { LayerVersion, Runtime } from '@aws-cdk/aws-lambda';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { Topic } from '@aws-cdk/aws-sns';
import { SnsEventSource } from '@aws-cdk/aws-lambda-event-sources';

interface AutoBrancherStackProps extends StackProps {
  /**
   * An ARN to a Lambda Layer that is used to provide the SSH and GIT clients to the function runtime.
   *
   * @default 'arn:aws:lambda:us-east-1:553035198032:layer:git-lambda2:8'
   */
  readonly gitLambdaLayerArn?: string;

  /**
   * The SSH repository URL that is cloned, branched, and pushed back.
   */
  readonly repository: string;

  /**
   * The SNS Topic arn to subscribe to for CDK construct publishing messages
   */
  readonly topicArn: string;
}

export class AutoBrancherStack extends Stack {
  constructor(scope: Construct, id: string, props: AutoBrancherStackProps) {
    super(scope, id, props);

    const layerVersionArn = props.gitLambdaLayerArn ?? 'arn:aws:lambda:us-east-1:553035198032:layer:git-lambda2:8';

    const secret = new Secret(this, 'DeployKey', {
      secretName: 'auto-brancher/deploy-key',
      description: 'An SSH private key for pushing changes to the repository.',
    });

    const lambda = new NodejsFunction(this, 'Lambda', {
      entry: path.join(__dirname, 'handlers', 'brancher.ts'),
      runtime: Runtime.NODEJS_14_X,
      environment: {
        SECRET_ID: secret.secretArn,
        REPOSITORY: props.repository,
      },
      timeout: Duration.seconds(30),
    });
    secret.grantRead(lambda);
    lambda.addLayers(LayerVersion.fromLayerVersionArn(this, 'GitLayer', layerVersionArn));
    const topic = Topic.fromTopicArn(this, 'ConstructPublishedListener', props.topicArn);
    lambda.addEventSource(new SnsEventSource(topic));
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new AutoBrancherStack(app, 'auto-brancher', {
  env: devEnv,
  repository: 'git@github.com:mbonig/rds-tools.git',
  topicArn: 'arn:aws:sns:us-east-1:536309290949:cdk-published-listener-cdkpublishedtopicD5C468C1-XAIU6DSBYOYQ',
});

app.synth();