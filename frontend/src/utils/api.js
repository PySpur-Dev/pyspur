import axios from 'axios';
import testInput from '../constants/test_input.js'; // Import the test input directly
import JSPydanticModel from './JSPydanticModel.js'; // Import the JSPydanticModel class
import { useDispatch } from 'react-redux';
import { setTestInputs } from '../store/flowSlice';

const API_BASE_URL = typeof window !== 'undefined'
  ? `http://${window.location.host}/api`
  : 'http://localhost:6080/api';

export const getNodeTypes = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/node/supported_types/`);
    console.log('Raw Node Types Response:', response.data);
    const model = new JSPydanticModel(response.data);

    // Get both the processed schema and metadata
    const schema = model.createObjectFromSchema();
    const metadata = model.getAllMetadata();

    console.log('Processed Schema:', schema);
    console.log('Schema Metadata:', metadata);

    // Return both schema and metadata
    return {
      schema,
      metadata
    };
  } catch (error) {
    console.error('Error getting node types:', error);
    throw error;
  }
};


export const runWorkflow = async (workflowData) => {
  try {
    // save the work flow Data to a file
    // Create a blob from the workflowData
    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create a link element and trigger a download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflowData.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('New Data:', testInput);

    const response = await axios.post(`${API_BASE_URL}/run_workflow/`, workflowData); // Use the test input instead of the actual data
    return response.data;
  } catch (error) {
    console.error('Error running workflow:', error);
    throw error;
  }
};

export const getRunStatus = async (runID) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/run/${runID}/status/`);
    return response.data;
  } catch (error) {
    console.error('Error getting run status:', error);
    throw error;
  }
};

export const getWorkflows = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/wf/`);
    return response.data;
  } catch (error) {
    console.error('Error getting workflows:', error);
    throw error;
  }
}

export const createWorkflow = async (workflowData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/wf/`, workflowData);
    return response.data;
  } catch (error) {
    console.error('Error creating workflow:', error);
    throw error;
  }
}

export const updateWorkflow = async (workflowId, workflowData) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/wf/${workflowId}/`, workflowData);
    return response.data;
  } catch (error) {
    console.error('Error updating workflow:', error);
    throw error;
  }
}

export const resetWorkflow = async (workflowId) => {
  try {
    const response = await axios.put(`${API_BASE_URL}/wf/${workflowId}/reset/`);
    return response.data;
  } catch (error) {
    console.error('Error resetting workflow:', error);
    throw error;
  }
}

export const startRun = async (workflowID, initialInputs = {}, parentRunId = null, runType = 'interactive') => {
  console.log('workflowID', workflowID, 'runType', runType, 'initialInputs', initialInputs, 'parentRunId', parentRunId);
  try {
    const requestBody = {
      initial_inputs: initialInputs,
      parent_run_id: parentRunId
    };
    const response = await axios.post(`${API_BASE_URL}/wf/${workflowID}/start_run/?run_type=${runType}`, requestBody);
    return response.data;
  } catch (error) {
    console.error('Error starting run:', error);
    throw error;
  }
}

export const startBatchRun = async (workflowID, datasetID, miniBatchSize = 10) => {
  try {
    const requestBody = {
      dataset_id: datasetID,
      mini_batch_size: miniBatchSize
    };
    const response = await axios.post(`${API_BASE_URL}/wf/${workflowID}/start_batch_run/`, requestBody);
    return response.data;
  } catch (error) {
    console.error('Error starting batch run:', error);
    throw error;
  }
}


export const getWorkflow = async (workflowID) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/wf/${workflowID}/`);
    return response.data;
  } catch (error) {
    console.error('Error getting workflow:', error);
    throw error;
  }
}

export const getAllRuns = async (lastK = 10, parentOnly = true, runType = "batch") => {
  try {
    const params = {
      last_k: lastK,
      parent_only: parentOnly,
      run_type: runType
    };
    const response = await axios.get(`${API_BASE_URL}/run/`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching runs:', error);
    throw error;
  }
}

export const downloadOutputFile = async (outputFileID) => {
  try {
    // First, get the output file details to find the original filename
    const fileInfoResponse = await axios.get(`${API_BASE_URL}/of/${outputFileID}/`);
    const fileName = fileInfoResponse.data.file_name;

    // Then, download the file
    const response = await axios.get(`${API_BASE_URL}/of/${outputFileID}/download/`, {
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;

    // Use the filename obtained from the output file details
    link.setAttribute('download', fileName);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading output file:', error);
    throw error;
  }
}


export const listApiKeys = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/env-mgmt/`);
    return response.data.keys;
  } catch (error) {
    console.error('Error listing API keys:', error);
    throw error;
  }
}

export const getApiKey = async (name) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/env-mgmt/${name}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting API key for ${name}:`, error);
    throw error;
  }
}

export const setApiKey = async (name, value) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/env-mgmt/`, { name, value });
    return response.data;
  } catch (error) {
    console.error(`Error setting API key for ${name}:`, error);
    throw error;
  }
}

export const deleteApiKey = async (name) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/env-mgmt/${name}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting API key for ${name}:`, error);
    throw error;
  }
}


export const uploadDataset = async (name, description, file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API_BASE_URL}/ds/?name=${encodeURIComponent(name)}&description=${encodeURIComponent(description)}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading dataset:', error);
    throw error;
  }
}

export const listDatasets = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ds/`);
    return response.data;
  } catch (error) {
    console.error('Error listing datasets:', error);
    throw error;
  }
}

export const getDataset = async (datasetId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ds/${datasetId}/`);
    return response.data;
  } catch (error) {
    console.error(`Error getting dataset with ID ${datasetId}:`, error);
    throw error;
  }
}

export const deleteDataset = async (datasetId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/ds/${datasetId}/`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting dataset with ID ${datasetId}:`, error);
    throw error;
  }
}

export const listDatasetRuns = async (datasetId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/ds/${datasetId}/list_runs/`);
    return response.data;
  } catch (error) {
    console.error(`Error listing runs for dataset with ID ${datasetId}:`, error);
    throw error;
  }
}

export const deleteWorkflow = async (workflowId) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/wf/${workflowId}/`);
    return response.status; // Should return 204 No Content
  } catch (error) {
    console.error('Error deleting workflow:', error);
    throw error;
  }
};

export const getTemplates = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/templates/`);
    console.log('Templates:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error getting templates:', error);
    throw error;
  }
};

export const instantiateTemplate = async (template) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/templates/instantiate/`, template);
    return response.data;
  } catch (error) {
    console.error('Error instantiating template:', error);
    throw error;
  }
};

export const duplicateWorkflow = async (workflowId) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/wf/${workflowId}/duplicate/`);
    return response.data;
  } catch (error) {
    console.error('Error duplicating workflow:', error);
    throw error;
  }
};

export const runPartialWorkflow = async (workflowId, nodeId, initialInputs, partialOutputs, rerunPredecessors) => {
  try {
    const requestBody = {
      node_id: nodeId,
      initial_inputs: initialInputs,
      partial_outputs: partialOutputs,
      rerun_predecessors: rerunPredecessors
    };
    const response = await axios.post(`${API_BASE_URL}/wf/${workflowId}/run_partial/`, requestBody);
    return response.data;
  } catch (error) {
    console.error('Error running partial workflow:', error);
    throw error;
  }
};